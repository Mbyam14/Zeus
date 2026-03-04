import { createClient } from '@supabase/supabase-js';

// Load from environment variables - set these in your .env file
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper function to call Edge Functions
export const callEdgeFunction = async (functionName: string, body: any) => {
  console.log('Calling Edge Function:', functionName);
  console.log('With body:', body);

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });

  console.log('Response data:', data);
  console.log('Response error:', error);

  if (error) {
    console.error('Edge Function error details:', {
      message: error.message,
      name: error.name,
      context: error.context,
      details: error,
    });
    throw error;
  }

  return data;
};
