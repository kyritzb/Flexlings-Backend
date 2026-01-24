const express = require('express');
const multer = require('multer');
const { openai } = require('../services/openai');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

router.post(
  '/generate-swolegotchi',
  (req, res, next) => {
    upload.single('inspirationImage')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE')
          return res
            .status(400)
            .json({ success: false, error: 'Image is too large. Max 4MB.' });
        return res
          .status(400)
          .json({
            success: false,
            error: 'File upload error',
            details: err.message,
          });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const { swolegotchiName } = req.body;
      const inspirationImage = req.file;
      console.log(`🎨 [${new Date().toISOString()}] Starting generation for "${swolegotchiName}" (Inspiration image: ${!!inspirationImage})`);
      if (!swolegotchiName || !swolegotchiName.trim())
        return res.status(400).json({ error: 'Flexling name is required' });
      if (!process.env.OPENAI_API_KEY)
        return res.status(500).json({ error: 'OpenAI API key not configured' });

      let prompt = `Create a cute, adorable 8-bit pixel art Pokemon-style character called "${swolegotchiName}" that is fitness and health themed. The character should be:
- A classic Game Boy pixel art style with limited color palette (green, black, white, yellow)
- Bright, vibrant colors typical of Pokemon characters
- Strong and fitness-focused while maintaining an endearing, game-like appearance
- Include fitness-related accessories or features (dumbbells, sweatbands, workout gear, muscle definition)
- Large, expressive eyes typical of Pokemon
- Suitable for a mobile fitness game character
- 8-bit pixel art aesthetic, Game Boy inspired, Pokemon-like, cute but strong, fitness-themed
- Square format, centered character design
- Retro gaming sprite style with clear, bold pixel art lines`;

      if (inspirationImage) {
        if (inspirationImage.size === 0)
          return res
            .status(400)
            .json({ success: false, error: 'Empty image file received.' });
        if (inspirationImage.size < 1024)
          return res
            .status(400)
            .json({
              success: false,
              error: 'Image file too small - likely corrupted.',
            });
        prompt += `\n\nINSPIRATION: Incorporate visual elements, colors, or characteristics from the user image while maintaining the 8-bit Pokemon fitness theme.`;
      }

      let response;
      if (inspirationImage) {
        const file = new File([inspirationImage.buffer], 'inspiration.png', {
          type: 'image/png',
        });
        response = await openai.images.edit({
          model: 'gpt-image-1',
          image: file,
          prompt,
          size: '1024x1024',
        });
      } else {
        response = await openai.images.generate({
          model: 'gpt-image-1',
          prompt,
          size: '1024x1024',
          quality: 'high',
        });
      }

      if (!response.data || !response.data[0] || !response.data[0].b64_json)
        throw new Error('No image data returned from OpenAI API');
      const generatedImageBase64 = response.data[0].b64_json;
      const generatedImageUrl = `data:image/png;base64,${generatedImageBase64}`;

      console.log(`✅ [${new Date().toISOString()}] Flexling "${swolegotchiName}" generated successfully!`);
      res.json({
        success: true,
        imageUrl: generatedImageUrl,
        swolegotchiName,
        message: 'Flexling generated successfully!',
      });
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Generation Error for "${req.body.swolegotchiName}":`, error);
      let statusCode = 500;
      let errorMessage = 'Failed to generate flexling';
      const msg = error.message || '';
      if (msg.includes('Invalid image file') || msg.includes('unsupported')) {
        statusCode = 400;
        errorMessage = 'Invalid image file format.';
      } else if (msg.includes('rate') || msg.includes('quota')) {
        statusCode = 429;
        errorMessage = 'Rate limit exceeded. Please try again later.';
      } else if (msg.includes('API key') || msg.includes('auth')) {
        statusCode = 500;
        errorMessage = 'OpenAI API configuration error.';
      } else if (msg.includes('size') || msg.includes('large')) {
        statusCode = 400;
        errorMessage = 'Image is too large. Please use a smaller image.';
      }
      res
        .status(statusCode)
        .json({ success: false, error: errorMessage, details: error.message });
    }
  }
);

module.exports = router;
