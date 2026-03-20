import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/themeStore';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  style?: any;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  message,
  onRetry,
  onDismiss,
  style,
}) => {
  const { colors } = useThemeStore();
  const slideAnim = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, []);

  const handleDismiss = () => {
    Animated.timing(slideAnim, {
      toValue: -80,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onDismiss?.());
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: '#FEF2F2', borderColor: '#FECACA', transform: [{ translateY: slideAnim }] },
        style,
      ]}
    >
      <Ionicons name="warning-outline" size={20} color="#DC2626" style={styles.icon} />
      <Text style={[styles.message, { color: '#991B1B' }]} numberOfLines={2}>
        {message}
      </Text>
      {onRetry && (
        <TouchableOpacity onPress={onRetry} style={styles.retryButton} activeOpacity={0.7}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      )}
      {onDismiss && (
        <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={18} color="#991B1B" />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  icon: {
    marginRight: 10,
  },
  message: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    marginLeft: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#DC2626',
    borderRadius: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
