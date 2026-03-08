import { ThemeColors } from '../store/themeStore';

export const getDifficultyColor = (difficulty: string, colors: ThemeColors): string => {
  switch (difficulty) {
    case 'Easy': return colors.success;
    case 'Medium': return colors.warning;
    case 'Hard': return colors.error;
    default: return colors.textMuted;
  }
};
