import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Guided first-run onboarding flow:
 * Step 1: Stock pantry (after preferences setup)
 * Step 2: Generate first meal plan (after pantry has items)
 * Step 3: View grocery list (after meal plan exists)
 * Step 4: Complete (all steps done)
 */
export type OnboardingStep = 'pantry' | 'meal_plan' | 'grocery' | 'complete';

interface OnboardingState {
  isFirstRun: boolean;
  currentStep: OnboardingStep;
  dismissed: boolean;
  aiBubblePulseSeen: boolean;

  // Actions
  startOnboarding: () => void;
  advanceStep: () => void;
  completeOnboarding: () => void;
  dismissBanner: () => void;
  markAiBubblePulseSeen: () => void;
  reset: () => void;
}

const STEP_ORDER: OnboardingStep[] = ['pantry', 'meal_plan', 'grocery', 'complete'];

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      isFirstRun: false,
      currentStep: 'pantry',
      dismissed: false,
      aiBubblePulseSeen: false,

      startOnboarding: () => {
        set({ isFirstRun: true, currentStep: 'pantry', dismissed: false });
      },

      markAiBubblePulseSeen: () => {
        set({ aiBubblePulseSeen: true });
      },

      advanceStep: () => {
        const { currentStep } = get();
        const idx = STEP_ORDER.indexOf(currentStep);
        if (idx < STEP_ORDER.length - 1) {
          set({ currentStep: STEP_ORDER[idx + 1], dismissed: false });
        }
      },

      completeOnboarding: () => {
        set({ isFirstRun: false, currentStep: 'complete', dismissed: false });
      },

      dismissBanner: () => {
        set({ dismissed: true });
      },

      reset: () => {
        set({ isFirstRun: false, currentStep: 'pantry', dismissed: false, aiBubblePulseSeen: false });
      },
    }),
    {
      name: 'zeus-onboarding',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
