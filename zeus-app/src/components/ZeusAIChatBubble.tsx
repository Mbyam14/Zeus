import React, { useEffect } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatStore } from '../store/chatStore';
import { useThemeStore } from '../store/themeStore';
import { useOnboardingStore } from '../store/onboardingStore';

export const ZeusAIChatBubble: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeStore();
  const toggleChat = useChatStore((s) => s.toggleChat);
  const isOpen = useChatStore((s) => s.isOpen);
  const unreadCount = useChatStore((s) => s.unreadCount);
  const aiBubblePulseSeen = useOnboardingStore((s) => s.aiBubblePulseSeen);
  const markAiBubblePulseSeen = useOnboardingStore((s) => s.markAiBubblePulseSeen);

  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const pulseScale = React.useRef(new Animated.Value(1)).current;
  const pulseOpacity = React.useRef(new Animated.Value(0)).current;

  // One-time discovery pulse the first time the user lands on the main app.
  useEffect(() => {
    if (aiBubblePulseSeen || isOpen) return;

    const delay = setTimeout(() => {
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseScale, {
              toValue: 1.8,
              duration: 900,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(pulseScale, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(pulseOpacity, {
              toValue: 0.4,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity, {
              toValue: 0,
              duration: 700,
              useNativeDriver: true,
            }),
          ]),
        ]),
        { iterations: 3 }
      ).start(() => {
        markAiBubblePulseSeen();
      });
    }, 800);

    return () => clearTimeout(delay);
  }, [aiBubblePulseSeen, isOpen, pulseScale, pulseOpacity, markAiBubblePulseSeen]);

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 0.85,
        useNativeDriver: true,
        speed: 50,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 12,
      }),
    ]).start();
    toggleChat();
  };

  if (isOpen) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: 90 + Math.max(insets.bottom, 0),
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      {/* Discovery pulse ring — fires once for new users. */}
      {!aiBubblePulseSeen && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseRing,
            {
              backgroundColor: colors.primary,
              opacity: pulseOpacity,
              transform: [{ scale: pulseScale }],
            },
          ]}
        />
      )}

      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.8}
        style={[styles.bubble, { backgroundColor: colors.primary }]}
        accessibilityLabel="Open Zeus AI chat"
      >
        <Ionicons name="flash" size={22} color="#FFF" />
      </TouchableOpacity>

      {unreadCount > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.error }]}>
          <Text style={styles.badgeText}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </Text>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    zIndex: 999,
  },
  bubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  pulseRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
