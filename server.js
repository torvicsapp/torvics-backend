import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { fal } from '@fal-ai/client';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Initialize Google Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Configure Fal.ai client
fal.config({ credentials: process.env.FAL_KEY });

// 1. Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'torvics-backend', timestamp: new Date() });
});

// 2. Apparel Analysis & Style Matching (Gemini)
app.post('/analyze-apparel', async (req, res) => {
  try {
    const { imageUrl, stylePrompt } = req.body;
    if (!imageUrl && !stylePrompt) {
      return res.status(400).json({ error: 'Provide either an imageUrl or stylePrompt' });
    }

    const promptText = `
      You are an expert personal stylist and visual merchandiser for Torvics.
      Analyze this user request/image and break down a complete outfit matching: "${stylePrompt || 'modern elevated aesthetic'}".
      Return strictly valid JSON with no markdown wrapping:
      {
        "styleTitle": "Name of the aesthetic",
        "aesthetic": "Brief 1-2 sentence description",
        "items": [
          {
            "category": "top" | "bottom" | "shoes" | "outerwear" | "accessory",
            "name": "Item Name",
            "description": "Specific cut, fabric, color",
            "searchQuery": "Exact e-commerce search query for retail matching",
            "estimatedPrice": "$XX - $YY"
          }
        ]
      }
    `;

    const contents = imageUrl 
      ? [{ text: promptText }, { image: { url: imageUrl } }]
      : [{ text: promptText }];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: { responseMimeType: 'application/json' }
    });

    const parsedData = JSON.parse(response.text.trim());
    return res.json(parsedData);
  } catch (error) {
    console.error('Analyze Apparel Error:', error);
    return res.status(500).json({ error: 'Failed to analyze apparel', details: error.message });
  }
});

// 3. Virtual Try-On Execution (Fal.ai FASHN v1.6)
app.post('/virtual-try-on', async (req, res) => {
  try {
    const { modelImage, garmentImage, category = 'auto' } = req.body;

    if (!modelImage || !garmentImage) {
      return res.status(400).json({ error: 'Both modelImage and garmentImage are required.' });
    }

    const result = await fal.subscribe('fal-ai/fashn/tryon/v1.6', {
      input: {
        model_image: modelImage,
        garment_image: garmentImage,
        category: category,
        mode: 'balanced'
      },
      logs: true
    });

    // Extract the generated image URL from Fal.ai's response payload
    const generatedUrl = result.data?.images?.[0]?.url || result.data?.image?.url;
    return res.json({ success: true, tryOnUrl: generatedUrl });
  } catch (error) {
    console.error('Virtual Try-On Error:', error);
    return res.status(500).json({ error: 'Virtual try-on generation failed', details: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Torvics backend listening on port ${PORT}`);
});
