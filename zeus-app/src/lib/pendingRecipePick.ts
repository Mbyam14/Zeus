import { Recipe } from '../types/recipe';

// One-shot callback registry used to ferry a picked recipe from the
// RecipePicker stack screen back to MealPlanEditScreen. React Navigation
// params can't carry functions reliably, and round-tripping via params +
// useEffect introduces races — a tiny module-level slot is simpler.
type Handler = (recipe: Recipe) => void;

let pending: Handler | null = null;

export const setPendingPickHandler = (h: Handler | null) => { pending = h; };
export const consumePendingPickHandler = (): Handler | null => {
  const h = pending;
  pending = null;
  return h;
};
