import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fal } from '@fal-ai/client';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

fal.config({
  credentials: process.env.FAL_KEY?.trim(),
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'torvics-backend', timestamp: new Date() });
});

// POST /api/try-on
app.post('/api/try-on', async (req, res) => {
  try {
    const { modelImageUrl, garmentImageUrl, category } = req.body;

    if (!modelImageUrl || !garmentImageUrl) {
      return res.status(400).json({ error: 'modelImageUrl and garmentImageUrl are required' });
    }

    const result = await fal.subscribe('fal-ai/fashn/tryon/v1.6', {
      input: {
        model_image: modelImageUrl,
        garment_image: garmentImageUrl,
        category: category || 'auto',
        mode: 'balanced',
      },
    });

    const outputUrl = result.data?.images?.[0]?.url || result.data?.image?.url;
    res.json({ success: true, tryOnImageUrl: outputUrl, raw: result.data });
  } catch (error) {
    console.error('Try-on error:', error);
    res.status(500).json({ error: error.message || 'Virtual try-on failed' });
  }
});

// POST /api/analyze-outfit
app.post('/api/analyze-outfit', async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/jpeg';

    const contents = [
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      },
      'Analyze this clothing item from the image. Return a JSON object with: { item_type: string, primary_color: string, secondary_colors: string[], pattern: string, material: string, fit: string, style_tags: string[], search_query: string } where search_query is an optimized shopping phrase to find identical or similar items to purchase online.',
    ];
    const config = { responseMimeType: 'application/json' };

    let geminiResponse;
    try {
      geminiResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config,
      });
    } catch (modelError) {
      if (modelError.status === 404) {
        console.warn('gemini-2.5-flash unavailable, falling back to gemini-flash-latest');
        geminiResponse = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents,
          config,
        });
      } else {
        throw modelError;
      }
    }

    const parsedData = JSON.parse(geminiResponse.text);
    res.json({ success: true, analysis: parsedData });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message || 'Analysis failed' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
