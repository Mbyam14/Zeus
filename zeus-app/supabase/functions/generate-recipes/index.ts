// Supabase Edge Function to generate recipes using Claude API
// Deploy with: supabase functions deploy generate-recipes

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const { ingredients, mealTypes } = await req.json()

    if (!ingredients || ingredients.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Ingredients are required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      )
    }

    const mealTypeText = mealTypes && mealTypes.length > 0
      ? `for ${mealTypes.join(' or ')}`
      : ''

    const prompt = `Given these ingredients: ${ingredients.join(', ')}, suggest 5 creative recipe ideas ${mealTypeText}.

For each recipe, provide:
1. A creative recipe title
2. A brief 1-sentence description

Format your response as a JSON array like this:
[
  {"title": "Recipe Name", "description": "Brief description"},
  ...
]

Only return the JSON array, nothing else.`

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.statusText}`)
    }

    const data = await response.json()
    const responseText = data.content[0].text

    // Parse the JSON response from Claude
    let suggestions
    try {
      // Claude might wrap JSON in markdown code blocks, extract it
      const jsonMatch = responseText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0])
      } else {
        suggestions = JSON.parse(responseText)
      }
    } catch (parseError) {
      console.error('Error parsing Claude response:', parseError)
      console.error('Response text:', responseText)
      throw new Error('Failed to parse recipe suggestions')
    }

    return new Response(
      JSON.stringify({ suggestions }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to generate recipes',
        details: error.message
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    )
  }
})
