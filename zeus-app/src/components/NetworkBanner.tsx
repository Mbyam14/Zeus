import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface NetworkBannerProps {
  isOffline: boolean;
  lastSynced?: Date | null;
}

export const NetworkBanner: React.FC<NetworkBannerProps> = ({ isOffline, lastSynced }) => {
  const slideAnim = useRef(new Animated.Value(-50)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: isOffline ? 0 : -50,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [isOffline]);

  if (!isOffline) return null;

  const timeAgo = lastSynced
    ? formatTimeAgo(lastSynced)
    : null;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <Ionicons name="cloud-offline-outline" size={16} color="#FFFFFF" />
      <Text style={styles.text}>
        You're offline{timeAgo ? ` · Last synced ${timeAgo}` : ''}
      </Text>
    </Animated.View>
  );
};

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6B7280',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
});
