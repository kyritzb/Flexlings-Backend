const express = require('express');
const { openai } = require('../services/openai');
const router = express.Router();

const EXA_API_KEY = 'a9f2fcd8-5ea4-4a0b-b75f-700a8c54d2ca';
const EXA_BASE_URL = 'https://api.exa.ai';

/**
 * Search Exa for food nutrition information with better image and data extraction
 */
router.post('/food/search-exa', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || query.length < 2) {
      return res.json({ results: [] });
    }

    console.log('🔍 Exa searching for:', query);

    // Enhanced search query for better results
    const searchQuery = `${query} nutrition calories protein serving size`;

    const response = await fetch(`${EXA_BASE_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': EXA_API_KEY,
      },
      body: JSON.stringify({
        query: searchQuery,
        numResults: 10,
        useAutoprompt: true,
        type: 'auto',
        contents: {
          text: {
            maxCharacters: 2000,
          },
          highlights: {
            highlightsPerUrl: 5,
            numSentences: 3,
            query: 'calories protein carbohydrates fat fiber sugar sodium serving size ounce oz ml grams nutritional information per serving'
          }
        }
      }),
    });

    if (!response.ok) {
      console.error('Exa API error:', response.status);
      throw new Error(`Exa API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return res.json({ results: [] });
    }

    console.log(`✅ Exa found ${data.results.length} results`);

    const nutritionData = [];

    for (const result of data.results) {
      const parsed = parseExaNutritionData(query, result);
      if (parsed) {
        // Filter out results with very low nutrition data quality
        if (parsed.calories > 0 || parsed.protein > 0) {
          nutritionData.push(parsed);
        }
      }
    }

    console.log(`📊 Parsed ${nutritionData.length} valid nutrition entries`);

    res.json({ results: nutritionData });
  } catch (error) {
    console.error('Error searching Exa for food:', error);
    res.status(500).json({ error: 'Failed to search for food', details: error.message });
  }
});

/**
 * Get food image from Exa
 */
router.post('/food/get-exa-image', async (req, res) => {
  try {
    const { foodName } = req.body;

    if (!foodName) {
      return res.status(400).json({ error: 'Food name is required' });
    }

    const searchQuery = `${foodName} food photo`;

    const response = await fetch(`${EXA_BASE_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': EXA_API_KEY,
      },
      body: JSON.stringify({
        query: searchQuery,
        numResults: 3,
        useAutoprompt: true,
        type: 'auto',
      }),
    });

    if (!response.ok) {
      throw new Error(`Exa API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return res.json({ image_url: null });
    }

    // Look for the first result with an image
    for (const result of data.results) {
      if (result.image) {
        return res.json({ image_url: result.image });
      }
    }

    res.json({ image_url: null });
  } catch (error) {
    console.error('Error getting Exa food image:', error);
    res.status(500).json({ error: 'Failed to get food image', details: error.message });
  }
});

/**
 * Parse nutrition data from Exa search results
 */
function parseExaNutritionData(originalQuery, result) {
  try {
    const text = result.text || '';
    const highlights = result.highlights || [];
    const combinedText = `${text} ${highlights.join(' ')}`.toLowerCase();

    // Extract quantity from original query (e.g., "2 mcchickens", "half of a banana")
    const quantity = parseQuantityFromQuery(originalQuery);

    // Extract nutrition values
    const calories = extractNutrientValue(combinedText, ['calories', 'cal', 'kcal']);
    const protein = extractNutrientValue(combinedText, ['protein', 'proteins']);
    const carbs = extractNutrientValue(combinedText, ['carbohydrates', 'carbs', 'carb']);
    const fat = extractNutrientValue(combinedText, ['fat', 'fats', 'total fat']);
    const fiber = extractNutrientValue(combinedText, ['fiber', 'dietary fiber']);
    const sugar = extractNutrientValue(combinedText, ['sugar', 'sugars']);
    const sodium = extractNutrientValue(combinedText, ['sodium', 'salt']);

    // Extract serving size
    const servingMatch = combinedText.match(/serving size[:\s]+(\d+\.?\d*)\s*([a-z]+)/i);
    const servingSize = servingMatch ? parseFloat(servingMatch[1]) : 1;
    const servingUnit = servingMatch ? servingMatch[2] : 'serving';

    // Only return if we have at least calories
    if (!calories && !protein) {
      return null;
    }

    // Apply quantity multiplier
    const multiplier = quantity || 1;

    return {
      food_name: cleanFoodName(originalQuery),
      calories: calories ? Math.round(calories * multiplier) : undefined,
      protein: protein ? Math.round(protein * multiplier * 10) / 10 : undefined,
      carbs: carbs ? Math.round(carbs * multiplier * 10) / 10 : undefined,
      fat: fat ? Math.round(fat * multiplier * 10) / 10 : undefined,
      fiber: fiber ? Math.round(fiber * multiplier * 10) / 10 : undefined,
      sugar: sugar ? Math.round(sugar * multiplier * 10) / 10 : undefined,
      sodium: sodium ? Math.round(sodium * multiplier * 10) / 10 : undefined,
      serving_size: servingSize * multiplier,
      serving_unit: servingUnit,
      image_url: result.image || undefined,
      source_url: result.url,
    };
  } catch (error) {
    console.error('Error parsing Exa nutrition data:', error);
    return null;
  }
}

/**
 * Extract quantity from query like "2 mcchickens" or "half of a banana"
 */
function parseQuantityFromQuery(query) {
  const lowerQuery = query.toLowerCase().trim();

  // Check for numeric quantity at the start
  const numMatch = lowerQuery.match(/^(\d+\.?\d*)\s+/);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }

  // Check for fractions
  if (lowerQuery.startsWith('half')) {
    return 0.5;
  }
  if (lowerQuery.startsWith('quarter')) {
    return 0.25;
  }
  if (lowerQuery.match(/^(one|a|an)\s+/)) {
    return 1;
  }

  return null;
}

/**
 * Clean food name from query
 */
function cleanFoodName(query) {
  // Remove quantity prefixes
  let cleaned = query
    .replace(/^\d+\.?\d*\s+/i, '')
    .replace(/^(half|quarter|one|a|an)\s+(of\s+)?/i, '')
    .trim();

  // Capitalize first letter
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Extract nutrient value from text using various patterns
 */
function extractNutrientValue(text, keywords) {
  for (const keyword of keywords) {
    // Pattern: "calories: 150" or "150 calories" or "calories 150"
    const patterns = [
      new RegExp(`${keyword}[:\\s]+([\\d\\.]+)`, 'i'),
      new RegExp(`([\\d\\.]+)\\s*${keyword}`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        if (!isNaN(value) && value > 0 && value < 100000) {
          return value;
        }
      }
    }
  }

  return null;
}

/**
 * Use LLM to calculate accurate nutrition for complex queries
 * Handles serving sizes, liquid measurements, and quantity math
 */
router.post('/food/calculate-nutrition', async (req, res) => {
  try {
    const { query, searchResults } = req.body;

    if (!query || !searchResults || searchResults.length === 0) {
      return res.status(400).json({ error: 'Query and search results required' });
    }

    console.log('🧮 LLM calculating nutrition for:', query);

    // Create prompt for LLM to calculate accurate nutrition
    const prompt = `You are a nutrition calculator. Given a food query and nutrition data from multiple sources, calculate the MOST ACCURATE nutrition information.

Query: "${query}"

Available nutrition data from web sources:
${searchResults.map((r, i) => `
Source ${i + 1}:
- Food: ${r.food_name}
- Calories: ${r.calories || 'unknown'}
- Protein: ${r.protein || 'unknown'}g
- Serving Size: ${r.serving_size || 'unknown'} ${r.serving_unit || ''}
${r.source_url ? `- Source: ${r.source_url}` : ''}
`).join('\n')}

Instructions:
1. Detect the QUANTITY and MEASUREMENT:
   - "2 mcchickens" = quantity: 2, food: "McChicken"
   - "22 oz sprite" = quantity: 1, serving_size: 22, serving_unit: "oz", food: "Sprite"
   - "32 ounce coke" = quantity: 1, serving_size: 32, serving_unit: "oz", food: "Coke"

2. Detect if it's a LIQUID (coke, sprite, water, juice, milk, beer, soda, etc.)

3. For liquids with measurements (oz, ml, cup):
   - quantity should ALWAYS be 1
   - serving_size is the actual measurement (e.g., 22 for "22 oz")
   - Find the STANDARD serving size (usually 12 oz for soda, 8 oz for juice/milk)
   - Calculate servings: e.g., 22 oz ÷ 12 oz = 1.83 servings
   - Calculate TOTAL nutrition: servings × calories_per_serving

4. For non-liquids with count (2 mcchickens, 3 eggs):
   - quantity is the count (e.g., 2)
   - Calculate: quantity × calories_per_item

5. Convert units properly: 1 oz ≈ 30ml, 1 cup = 8 oz = 240ml

6. Common reference values: 12 oz coke ≈ 140 cal, 8 oz milk ≈ 150 cal

7. Include source URLs: Return the URLs of the 1-3 most reliable sources you used for the calculation

Example calculation for "22 oz sprite":
- quantity: 1 (NOT 22!)
- serving_size: 22
- serving_unit: "oz"
- Standard serving: 12 oz = 140 calories
- Servings: 22 ÷ 12 = 1.83
- Total calories: 1.83 × 140 = 257 calories

Return a JSON object with this exact structure:
{
  "food_name": "cleaned food name without quantity (e.g., 'Sprite', 'McChicken')",
  "quantity": number (count of items: 2 for "2 mcchickens", but 1 for "22 oz sprite"),
  "is_liquid": boolean,
  "calories": total_calories_for_quantity,
  "calories_per_item": calories_per_single_item_or_standard_serving,
  "protein": total_protein_in_grams,
  "protein_per_item": protein_per_single_item_or_standard_serving,
  "carbs": total_carbs_in_grams,
  "fat": total_fat_in_grams,
  "fiber": total_fiber_in_grams,
  "sugar": total_sugar_in_grams,
  "sodium": total_sodium_in_mg,
  "serving_size": number (for liquids: 22 for "22 oz", for food: 1),
  "serving_unit": "g" or "oz" or "ml" or "cup" or "item",
  "standard_serving_size": number (standard serving, e.g., 12 for soda),
  "standard_serving_unit": "oz" or "ml" or "g" (only for liquids),
  "servings_consumed": number (calculated servings, e.g., 1.83 for 22oz÷12oz),
  "serving_calculation": "brief calculation (e.g., '1.8 servings × 140 cal' - do NOT include the user's quantity again)",
  "source_urls": [array of 1-3 most relevant source URLs used for the nutrition calculation],
  "confidence": "high" or "medium" or "low"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a nutrition expert. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const result = JSON.parse(completion.choices[0].message.content);
    console.log('✅ LLM calculation complete:', result);

    res.json(result);
  } catch (error) {
    console.error('Error calculating nutrition with LLM:', error);
    res.status(500).json({ error: 'Failed to calculate nutrition', details: error.message });
  }
});

module.exports = router;
