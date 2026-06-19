import { Recipe } from '../types/recipe';

type Handler = (recipe: Recipe) => void;

let pending: Handler | null = null;

export const setPendingCreateHandler = (handler: Handler | null) => {
  pending = handler;
};

export const consumePendingCreateHandler = (): Handler | null => {
  const h = pending;
  pending = null;
  return h;
};
