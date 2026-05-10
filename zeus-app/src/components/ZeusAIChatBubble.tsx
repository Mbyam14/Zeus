import React from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatStore } from '../store/chatStore';
import { useThemeStore } from '../store/themeStore';

export const ZeusAIChatBubble: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeStore();
  const toggleChat = useChatStore((s) => s.toggleChat);
  const isOpen = useChatStore((s) => s.isOpen);
  const unreadCount = useChatStore((s) => s.unreadCount);

  const scaleAnim = React.useRef(new Animated.Value(1)).current;

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
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.8}
        style={[styles.bubble, { backgroundColor: colors.primary }]}
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
    opacity: 0.85,
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
