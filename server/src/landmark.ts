// Optional vision check for photo-based stamp collection: when the uploaded
// photo has no usable EXIF location, verify whether the photo actually shows the
// place's landmark. Tries Gemini (primary) then falls back to Hugging Face (secondary).
// Enabled when GOOGLE_API_KEY or HUGGINGFACE_API_KEY is configured — the app stays
// fully functional (EXIF path only) without either.
import { GoogleGenerativeAI } from '@google/generative-ai';
import { HfInference } from '@huggingface/inference';

export const LANDMARK_CHECK_ENABLED =
  Boolean(process.env.GOOGLE_API_KEY) || Boolean(process.env.HUGGINGFACE_API_KEY);

export interface LandmarkVerdict {
  match: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

let geminiClient: GoogleGenerativeAI | null = null;
let huggingFaceClient: HfInference | null = null;

function initGemini() {
  if (process.env.GOOGLE_API_KEY && !geminiClient) {
    geminiClient = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  }
  return geminiClient;
}

function initHuggingFace() {
  if (process.env.HUGGINGFACE_API_KEY && !huggingFaceClient) {
    huggingFaceClient = new HfInference(process.env.HUGGINGFACE_API_KEY);
  }
  return huggingFaceClient;
}

async function verifyWithGemini(
  placeName: string,
  country: string,
  imageBuffer: Buffer,
  mimeType: string,
): Promise<LandmarkVerdict> {
  const client = initGemini();
  if (!client) throw new Error('Gemini not configured');

  const model = client.getGenerativeModel({ model: process.env.GOOGLE_MODEL ?? 'gemini-2.0-flash' });

  const response = await model.generateContent([
    {
      inlineData: {
        mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
        data: imageBuffer.toString('base64'),
      },
    },
    {
      text:
        `Does this photo clearly show "${placeName}" in ${country}, or an unmistakable famous ` +
        `feature of that specific place? A generic scene that could be anywhere does not count. ` +
        `Be strict: only return true when the place is identifiable. ` +
        `Respond ONLY with valid JSON (no markdown, no code blocks): {"match": boolean, "confidence": "high"|"medium"|"low", "reason": "one short sentence"}`,
    },
  ]);

  const text = response.response.text();
  return JSON.parse(text) as LandmarkVerdict;
}

async function verifyWithHuggingFace(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<LandmarkVerdict> {
  const client = initHuggingFace();
  if (!client) throw new Error('Hugging Face not configured');

  const model = process.env.HUGGINGFACE_MODEL ?? 'Qwen/Qwen2-VL-72B-Instruct';

  const response = await client.imageToText({
    model,
    inputs: new Blob([imageBuffer], { type: mimeType }),
  });

  const text = (response as { generated_text?: string }).generated_text || '';

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not parse Hugging Face response: ${text}`);
  }

  return JSON.parse(jsonMatch[0]) as LandmarkVerdict;
}

export async function verifyLandmarkPhoto(
  placeName: string,
  country: string,
  photoDataUrl: string,
): Promise<LandmarkVerdict> {
  const match = photoDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('invalid photo data URL');

  const mimeType = match[1];
  const imageBuffer = Buffer.from(match[2], 'base64');

  // Try Gemini first
  if (process.env.GOOGLE_API_KEY) {
    try {
      return await verifyWithGemini(placeName, country, imageBuffer, mimeType);
    } catch (error) {
      console.warn('Gemini verification failed, falling back to Hugging Face:', error);
    }
  }

  // Fall back to Hugging Face
  if (process.env.HUGGINGFACE_API_KEY) {
    try {
      return await verifyWithHuggingFace(imageBuffer, mimeType);
    } catch (error) {
      console.warn('Hugging Face verification failed:', error);
      throw new Error('All vision verification services unavailable');
    }
  }

  throw new Error('No vision verification service configured');
}
