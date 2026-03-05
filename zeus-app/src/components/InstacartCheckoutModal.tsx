/**
 * InstacartCheckoutModal
 *
 * Multi-step modal for Instacart checkout:
 * 1. Store selection (enter zip, pick retailer)
 * 2. Product matching review (see matched/unmatched items)
 * 3. Checkout redirect (open Instacart)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { instacartService } from '../services/instacartService';
import {
  InstacartRetailer,
  ProductMatchResult,
  ProductMatchSummary,
} from '../types/instacart';
import { GroceryList } from '../types/grocerylist';
import { useThemeStore } from '../store/themeStore';

interface Props {
  visible: boolean;
  groceryList: GroceryList | null;
  onClose: () => void;
}

type Step = 'store' | 'matching' | 'review' | 'checkout';

export const InstacartCheckoutModal: React.FC<Props> = ({
  visible,
  groceryList,
  onClose,
}) => {
  const { colors } = useThemeStore();

  // State
  const [step, setStep] = useState<Step>('store');
  const [loading, setLoading] = useState(false);
  const [zipCode, setZipCode] = useState('');
  const [retailers, setRetailers] = useState<InstacartRetailer[]>([]);
  const [selectedRetailer, setSelectedRetailer] = useState<InstacartRetailer | null>(null);
  const [matches, setMatches] = useState<ProductMatchResult[]>([]);
  const [matchSummary, setMatchSummary] = useState<ProductMatchSummary | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load saved preferences on open
  useEffect(() => {
    if (visible) {
      loadPreferences();
    }
  }, [visible]);

  // Reset on close
  useEffect(() => {
    if (!visible) {
      setStep('store');
      setRetailers([]);
      setSelectedRetailer(null);
      setMatches([]);
      setMatchSummary(null);
      setCheckoutUrl(null);
      setError(null);
    }
  }, [visible]);

  const loadPreferences = async () => {
    try {
      const prefs = await instacartService.getPreferences();
      if (prefs.zip_code) {
        setZipCode(prefs.zip_code);
      }
    } catch (e) {
      // Ignore - preferences are optional
    }
  };

  // Fetch retailers when zip code is entered
  const handleSearchRetailers = async () => {
    if (zipCode.length !== 5) {
      Alert.alert('Invalid Zip', 'Please enter a valid 5-digit zip code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results = await instacartService.getRetailers(zipCode);
      setRetailers(results);

      if (results.length === 0) {
        setError('No retailers available in your area. Try a different zip code.');
      }
    } catch (err: any) {
      const message = err.response?.data?.detail || err.message || 'Failed to fetch retailers';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Match products after store selection
  const handleSelectRetailer = async (retailer: InstacartRetailer) => {
    setSelectedRetailer(retailer);

    if (!groceryList) return;

    setStep('matching');
    setLoading(true);
    setError(null);

    try {
      const { matches: matchResults, summary } = await instacartService.matchProducts(
        groceryList.id,
        retailer.id
      );
      setMatches(matchResults);
      setMatchSummary(summary);
      setStep('review');
    } catch (err: any) {
      const message = err.response?.data?.detail || err.message || 'Failed to match products';
      setError(message);
      setStep('store');
    } finally {
      setLoading(false);
    }
  };

  // Create cart and get checkout URL
  const handleProceedToCheckout = async () => {
    if (!groceryList || !selectedRetailer) return;

    setLoading(true);
    setError(null);

    try {
      const cart = await instacartService.createCart(
        groceryList.id,
        selectedRetailer.id,
        zipCode
      );

      if (cart.checkout_url) {
        setCheckoutUrl(cart.checkout_url);
        setStep('checkout');
      } else {
        setError('Failed to get checkout URL. Please try again.');
      }
    } catch (err: any) {
      const message = err.response?.data?.detail || err.message || 'Failed to create cart';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Open Instacart checkout
  const handleOpenInstacart = async () => {
    if (!checkoutUrl) return;

    try {
      await instacartService.openCheckout(checkoutUrl);
      onClose();
    } catch (err) {
      Alert.alert('Error', 'Could not open Instacart. Please try copying the link manually.');
    }
  };

  const styles = createStyles(colors);

  // Render store selection step
  const renderStoreStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Select Your Store</Text>
      <Text style={styles.stepSubtitle}>
        Enter your zip code to see available stores
      </Text>

      <View style={styles.zipCodeRow}>
        <TextInput
          style={styles.zipInput}
          placeholder="Enter zip code"
          placeholderTextColor={colors.textMuted}
          value={zipCode}
          onChangeText={setZipCode}
          keyboardType="number-pad"
          maxLength={5}
          autoFocus
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={handleSearchRetailers}
          disabled={loading || zipCode.length !== 5}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Ionicons name="search" size={20} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color="#D32F2F" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={retailers}
        keyExtractor={(item) => item.id}
        style={styles.retailerList}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.retailerCard}
            onPress={() => handleSelectRetailer(item)}
          >
            {item.logo_url ? (
              <Image source={{ uri: item.logo_url }} style={styles.retailerLogo} />
            ) : (
              <View style={styles.retailerLogoPlaceholder}>
                <Ionicons name="storefront" size={24} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.retailerInfo}>
              <Text style={styles.retailerName}>{item.name}</Text>
              {item.estimated_delivery && (
                <Text style={styles.retailerDetail}>
                  Delivery: {item.estimated_delivery}
                </Text>
              )}
              {item.min_order && (
                <Text style={styles.retailerDetail}>
                  Min order: ${item.min_order}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading && zipCode.length === 5 && retailers.length === 0 && !error ? (
            <Text style={styles.emptyText}>No retailers found</Text>
          ) : null
        }
      />
    </View>
  );

  // Render matching step (loading)
  const renderMatchingStep = () => (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.matchingTitle}>Matching Products...</Text>
      <Text style={styles.matchingSubtitle}>
        Finding your grocery items at {selectedRetailer?.name}
      </Text>
    </View>
  );

  // Render product review step
  const renderReviewStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Review Products</Text>

      {matchSummary && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{matchSummary.matched}</Text>
              <Text style={styles.summaryLabel}>Matched</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, matchSummary.not_found > 0 && styles.warningValue]}>
                {matchSummary.not_found}
              </Text>
              <Text style={styles.summaryLabel}>Not Found</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{matchSummary.match_rate}%</Text>
              <Text style={styles.summaryLabel}>Match Rate</Text>
            </View>
          </View>

          {matchSummary.not_found > 0 && (
            <Text style={styles.warningNote}>
              Items not found may need to be added manually on Instacart
            </Text>
          )}
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color="#D32F2F" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <ScrollView style={styles.matchList}>
        {matches.map((item) => (
          <View
            key={item.id}
            style={[
              styles.matchCard,
              item.match_status === 'not_found' && styles.matchCardWarning,
            ]}
          >
            <View style={styles.matchIcon}>
              {item.match_status === 'matched' ? (
                <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
              ) : item.match_status === 'low_confidence' ? (
                <Ionicons name="help-circle" size={24} color="#FF9800" />
              ) : (
                <Ionicons name="close-circle" size={24} color="#F44336" />
              )}
            </View>
            <View style={styles.matchInfo}>
              <Text style={styles.matchOriginal}>{item.original_name}</Text>
              {item.matched_product_name ? (
                <Text style={styles.matchFound}>
                  → {item.matched_product_name}
                  {item.matched_unit_price && ` ($${item.matched_unit_price.toFixed(2)})`}
                </Text>
              ) : (
                <Text style={styles.matchNotFound}>No match found</Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity
        style={[styles.continueButton, loading && styles.buttonDisabled]}
        onPress={handleProceedToCheckout}
        disabled={loading || (matchSummary?.matched ?? 0) === 0}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name="cart" size={20} color="#FFF" />
            <Text style={styles.continueButtonText}>
              Continue to Instacart ({matchSummary?.matched ?? 0} items)
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  // Render checkout step
  const renderCheckoutStep = () => (
    <View style={styles.centerContainer}>
      <View style={styles.checkoutIconContainer}>
        <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
      </View>

      <Text style={styles.checkoutTitle}>Cart Ready!</Text>

      <Text style={styles.checkoutText}>
        Your cart has been created at {selectedRetailer?.name}. Tap below to complete your order on Instacart.
      </Text>

      <TouchableOpacity
        style={styles.instacartButton}
        onPress={handleOpenInstacart}
      >
        <Text style={styles.instacartButtonText}>Open Instacart to Checkout</Text>
        <Ionicons name="open-outline" size={20} color="#FFF" />
      </TouchableOpacity>

      <Text style={styles.noteText}>
        Zeus earns a small commission when you complete your purchase. Thank you for supporting us!
      </Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {step === 'store' && 'Select Store'}
            {step === 'matching' && 'Matching...'}
            {step === 'review' && 'Review Items'}
            {step === 'checkout' && 'Checkout'}
          </Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Progress */}
        <View style={styles.progress}>
          <View style={[styles.progressDot, (step === 'store' || step === 'matching' || step === 'review' || step === 'checkout') && styles.progressDotActive]} />
          <View style={[styles.progressLine, (step === 'review' || step === 'checkout') && styles.progressLineActive]} />
          <View style={[styles.progressDot, (step === 'review' || step === 'checkout') && styles.progressDotActive]} />
          <View style={[styles.progressLine, step === 'checkout' && styles.progressLineActive]} />
          <View style={[styles.progressDot, step === 'checkout' && styles.progressDotActive]} />
        </View>

        {/* Step content */}
        {step === 'store' && renderStoreStep()}
        {step === 'matching' && renderMatchingStep()}
        {step === 'review' && renderReviewStep()}
        {step === 'checkout' && renderCheckoutStep()}
      </View>
    </Modal>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 40,
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.border,
  },
  progressDotActive: {
    backgroundColor: colors.primary,
  },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: 8,
  },
  progressLineActive: {
    backgroundColor: colors.primary,
  },
  stepContainer: {
    flex: 1,
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 20,
  },
  zipCodeRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  zipInput: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    color: colors.text,
    backgroundColor: colors.card,
  },
  searchButton: {
    width: 50,
    height: 50,
    borderRadius: 12,
    marginLeft: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#D32F2F',
    marginLeft: 8,
    flex: 1,
  },
  retailerList: {
    flex: 1,
  },
  retailerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: colors.card,
  },
  retailerLogo: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  retailerLogoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retailerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  retailerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  retailerDetail: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: colors.textMuted,
    marginTop: 32,
  },
  matchingTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginTop: 20,
  },
  matchingSubtitle: {
    fontSize: 16,
    color: colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  warningValue: {
    color: '#F57C00',
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  warningNote: {
    fontSize: 13,
    color: '#F57C00',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  matchList: {
    flex: 1,
  },
  matchCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: colors.card,
  },
  matchCardWarning: {
    borderLeftWidth: 3,
    borderLeftColor: '#F44336',
  },
  matchIcon: {
    marginRight: 12,
    justifyContent: 'center',
  },
  matchInfo: {
    flex: 1,
  },
  matchOriginal: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  matchFound: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  matchNotFound: {
    fontSize: 13,
    color: '#F44336',
    marginTop: 2,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    backgroundColor: colors.primary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  checkoutIconContainer: {
    marginBottom: 24,
  },
  checkoutTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  checkoutText: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  instacartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#43B02A', // Instacart green
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 8,
  },
  instacartButtonText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '600',
  },
  noteText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
});
