/**
 * Centralized color palette for the app.
 * All color values used throughout the app are defined here
 * for consistency and easy brand updates.
 */

const Colors = {
  // Primary brand
  primary: '#FF6B35',
  primaryGradientEnd: '#FF8C42',

  // Secondary accent (deep green for freshness)
  secondary: '#2D6A4F',

  // Text
  textPrimary: '#2C3E50',
  textSecondary: '#7F8C8D',
  textPlaceholder: '#95A5A6',
  textDisabled: '#BDC3C7',

  // Backgrounds
  background: '#FFF8F0',
  backgroundCard: '#FFFFFF',
  backgroundSubtle: '#FFF5F2',

  // Borders
  border: '#E1E8ED',

  // Status / Difficulty
  success: '#2ECC71',
  successDark: '#27AE60',
  warning: '#F7B32B',
  warningAlt: '#F39C12',
  error: '#E74C3C',

  // Overlays
  overlayDark: 'rgba(0,0,0,0.6)',
  overlayMedium: 'rgba(0,0,0,0.5)',
  overlayLight: 'rgba(0,0,0,0.3)',
  overlayHeavy: 'rgba(0,0,0,0.7)',

  // Swipe feedback
  swipeLike: 'rgba(46, 204, 113, 0.5)',
  swipeSkip: 'rgba(231, 76, 60, 0.5)',
  swipeSave: 'rgba(247, 179, 43, 0.5)',

  // Misc
  white: '#FFFFFF',
  dietaryTagBg: '#E8F5E9',
  deleteButtonBg: '#FFE5E0',
} as const;

export default Colors;
