# Claude AI Integration Setup Guide

This guide explains how to set up Claude AI recipe generation using Supabase Edge Functions.

## Prerequisites

1. Supabase account and project
2. Anthropic API key
3. Supabase CLI installed

## Setup Steps

### 1. Get Your Anthropic API Key

1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Navigate to "API Keys"
4. Create a new API key and save it securely

### 2. Configure Supabase Project

1. Go to your Supabase project dashboard: https://app.supabase.com
2. Navigate to Settings → API
3. Copy your:
   - Project URL
   - Anon/Public key

### 3. Set Up Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

### 4. Install Supabase CLI

```bash
brew install supabase/tap/supabase
```

Or follow instructions at: https://supabase.com/docs/guides/cli

### 5. Deploy Edge Function

1. Login to Supabase CLI:
```bash
supabase login
```

2. Link your project:
```bash
supabase link --project-ref your-project-ref
```

3. Set the Anthropic API key as a secret:
```bash
supabase secrets set ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

4. Deploy the Edge Function:
```bash
supabase functions deploy generate-recipes
```

### 6. Test the Integration

1. Run your React Native app
2. Navigate to the AI screen (tap the orange AI button on Create tab)
3. Enter ingredients (e.g., "chicken, rice, garlic")
4. Select meal types
5. Tap "Find Recipes"

## Edge Function Location

The Edge Function is located at:
```
supabase/functions/generate-recipes/index.ts
```

## How It Works

1. **User Input**: User enters ingredients and selects meal types in the app
2. **App → Supabase**: App calls Supabase Edge Function via `callEdgeFunction()`
3. **Supabase → Claude**: Edge Function securely calls Claude API with your API key
4. **Claude → Supabase**: Claude returns recipe suggestions
5. **Supabase → App**: Edge Function returns suggestions to the app
6. **Display**: App displays recipe cards to user

## Security

- ✅ API key is stored securely in Supabase secrets
- ✅ API key never exposed to client app
- ✅ All API calls go through your Supabase backend
- ✅ Row Level Security (RLS) can be added for user authentication

## Troubleshooting

### "Failed to generate recipe suggestions"

1. Check Supabase Function Logs:
   - Go to Supabase Dashboard → Edge Functions → Logs
2. Verify your ANTHROPIC_API_KEY is set:
   ```bash
   supabase secrets list
   ```
3. Check your API key is valid at https://console.anthropic.com

### Function not found

1. Verify function is deployed:
   ```bash
   supabase functions list
   ```
2. Re-deploy if needed:
   ```bash
   supabase functions deploy generate-recipes
   ```

### CORS errors

- The Edge Function includes CORS headers
- Make sure you're using the correct Supabase URL in your .env file

## Cost Considerations

- **Claude API**: Charged per token (input + output)
- **Supabase Edge Functions**: Free tier includes 500K function invocations/month
- Estimated cost per recipe generation: $0.01-0.03 depending on response size

## Next Steps

- Add user authentication
- Store generated recipes in Supabase database
- Add rate limiting
- Implement caching for common ingredient combinations
