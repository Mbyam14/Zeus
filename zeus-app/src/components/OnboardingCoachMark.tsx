import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/themeStore';

interface CoachMarkProps {
  visible: boolean;
  title: string;
  message: string;
  tabIndex: number;        // 0-based index of the anchor tab
  tabCount: number;        // total tabs (for x-position math)
  bottomOffset: number;    // height of tab bar (so tooltip floats above it)
  onSkipAll: () => void;
}

const TOOLTIP_WIDTH = 260;
const ARROW_SIZE = 10;

export const OnboardingCoachMark: React.FC<CoachMarkProps> = ({
  visible,
  title,
  message,
  tabIndex,
  tabCount,
  bottomOffset,
  onSkipAll,
}) => {
  const { colors } = useThemeStore();
  const screenWidth = Dimensions.get('window').width;
  const tabWidth = screenWidth / tabCount;
  const anchorX = tabWidth * (tabIndex + 0.5);

  // Clamp tooltip so it stays on-screen.
  const tooltipLeft = Math.max(
    16,
    Math.min(anchorX - TOOLTIP_WIDTH / 2, screenWidth - TOOLTIP_WIDTH - 16)
  );
  const arrowLeft = anchorX - tooltipLeft - ARROW_SIZE;

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const arrowBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      translateY.setValue(20);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 11 }),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowBounce, {
          toValue: 6,
          duration: 600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(arrowBounce, {
          toValue: 0,
          duration: 600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, opacity, translateY, arrowBounce]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          bottom: bottomOffset + 12,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        style={[
          styles.tooltip,
          {
            left: tooltipLeft,
            backgroundColor: colors.text,
            width: TOOLTIP_WIDTH,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.background }]}>{title}</Text>
          <TouchableOpacity
            onPress={onSkipAll}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Skip tour"
          >
            <Text style={[styles.skipText, { color: colors.background }]}>Skip tour</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.message, { color: colors.background }]}>{message}</Text>

        <Animated.View
          style={[
            styles.arrow,
            {
              left: arrowLeft,
              borderTopColor: colors.text,
              transform: [{ translateY: arrowBounce }],
            },
          ]}
        />

        <Animated.View
          style={[
            styles.arrowIcon,
            { left: anchorX - 12 - tooltipLeft, transform: [{ translateY: arrowBounce }] },
          ]}
        >
          <Ionicons name="chevron-down" size={24} color={colors.text} />
        </Animated.View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1001,
  },
  tooltip: {
    position: 'relative',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  skipText: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.7,
    marginLeft: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 19,
    opacity: 0.9,
  },
  arrow: {
    position: 'absolute',
    bottom: -ARROW_SIZE,
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderTopWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  arrowIcon: {
    position: 'absolute',
    bottom: -28,
  },
});

export default OnboardingCoachMark;
