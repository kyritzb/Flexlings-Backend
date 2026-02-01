const { env } = require('../config/env');

/**
 * Generates an image using Gemini 3 Pro Image Preview (Nano Banana API)
 * @param {string} prompt - The prompt for image generation
 * @param {string|null} inspirationImageBase64 - Optional base64 encoded inspiration image
 * @returns {Promise<string>} - Base64 encoded generated image
 */
const generateGeminiImage = async (prompt, inspirationImageBase64 = null) => {
  const apiKey = env.geminiApiKey;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  // Using the exact URL provided in the user's curl example
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`;

  const parts = [{ text: prompt }];

  if (inspirationImageBase64) {
    parts.push({
      inline_data: {
        mime_type: 'image/png',
        data: inspirationImageBase64
      }
    });
  }

  const payload = {
    contents: [{
      parts: parts
    }]
  };

  console.log(`🚀 [Gemini] Sending request to Nano Banana API...`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ [Gemini] API Error: ${response.status}`, errorText);
    throw new Error(`Gemini API error: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  
  // Helper to find the "data" field in the response, as the curl grep -o '"data": "[^"]*"' suggests
  const findImageData = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.data && typeof obj.data === 'string' && obj.data.length > 100) return obj.data;
    
    for (const key in obj) {
      const found = findImageData(obj[key]);
      if (found) return found;
    }
    return null;
  };

  const base64Data = findImageData(result);
  
  if (!base64Data) {
    console.error('❌ [Gemini] Could not find image data in response:', JSON.stringify(result).substring(0, 500));
    throw new Error('No image data found in Gemini response');
  }

  return base64Data;
};

module.exports = { generateGeminiImage };
