import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://krshbdtqawtjbjnfggwd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtyc2hiZHRxYXd0amJqbmZnZ3dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzODYyNDMsImV4cCI6MjA3Nzk2MjI0M30._JRul8vD2oQse4rr7fsZPJD7mrrNJFYdtSihcUmPppc';

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
