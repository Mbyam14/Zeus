import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeStore } from '../store/themeStore';

export type TabHeaderActionVariant = 'primary' | 'secondary' | 'destructive';

export type TabHeaderAction = {
  icon: string;
  onPress: () => void;
  accessibilityLabel?: string;
  variant?: TabHeaderActionVariant;
};

export type TabHeaderProps = {
  title: string;
  primaryAction?: TabHeaderAction;
  secondaryActions?: TabHeaderAction[];
  style?: StyleProp<ViewStyle>;
};

const PRIMARY_SIZE = 44;
const SECONDARY_SIZE = 36;

export const TabHeader: React.FC<TabHeaderProps> = ({
  title,
  primaryAction,
  secondaryActions,
  style,
}) => {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors);

  const renderAction = (action: TabHeaderAction, isPrimary: boolean) => {
    const size = isPrimary ? PRIMARY_SIZE : SECONDARY_SIZE;
    const variant: TabHeaderActionVariant = action.variant ?? (isPrimary ? 'primary' : 'secondary');

    let bgColor: string;
    let iconColor: string;
    switch (variant) {
      case 'primary':
        bgColor = colors.primary;
        iconColor = colors.backgroundSecondary;
        break;
      case 'destructive':
        bgColor = colors.background;
        iconColor = colors.error || '#FF3B30';
        break;
      case 'secondary':
      default:
        bgColor = colors.background;
        iconColor = colors.primary;
        break;
    }

    return (
      <TouchableOpacity
        key={`${action.icon}-${variant}`}
        onPress={action.onPress}
        accessibilityRole="button"
        accessibilityLabel={action.accessibilityLabel ?? action.icon}
        activeOpacity={0.7}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={action.icon as any} size={isPrimary ? 28 : 20} color={iconColor} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.header, { paddingTop: insets.top }, style]}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.actions}>
        {secondaryActions?.slice(0, 2).map((a) => renderAction(a, false))}
        {primaryAction && renderAction(primaryAction, true)}
      </View>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingBottom: 16,
      backgroundColor: colors.backgroundSecondary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.primary,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
  });

export default TabHeader;
