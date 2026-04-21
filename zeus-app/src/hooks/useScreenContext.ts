import { useEffect } from 'react';
import { useNavigationState } from '@react-navigation/native';
import { useChatStore } from '../store/chatStore';

/**
 * Tracks the current navigation screen and updates chatStore.screenContext.
 * Extracts recipe info when on RecipeDetail screens.
 */
export function useScreenContext() {
  const navState = useNavigationState((state) => state);
  const setScreenContext = useChatStore((s) => s.setScreenContext);

  useEffect(() => {
    if (!navState) return;

    const context = extractScreenContext(navState);
    if (context) {
      setScreenContext(context);
    }
  }, [navState]);
}

function extractScreenContext(state: any): { screen: string; recipe_id?: string; recipe_title?: string; meal_plan_day?: string } | null {
  if (!state?.routes) return null;

  // Get the active route at the deepest level
  const activeRoute = getActiveRoute(state);
  if (!activeRoute) return null;

  const screen = activeRoute.name || 'Unknown';
  const params = activeRoute.params as any;

  const context: any = { screen };

  // Extract recipe context if on RecipeDetail
  if (screen === 'RecipeDetail' && params?.recipe) {
    context.recipe_id = params.recipe.id;
    context.recipe_title = params.recipe.title;
  }

  return context;
}

function getActiveRoute(state: any): any {
  if (!state?.routes) return state;
  const route = state.routes[state.index ?? 0];
  if (route.state) {
    return getActiveRoute(route.state);
  }
  return route;
}
