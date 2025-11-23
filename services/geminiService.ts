import { GoogleGenAI } from "@google/genai";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY environment variable is missing.");
  }
  return new GoogleGenAI({ apiKey });
};

// Convert Blob to Base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const identifyAsset = async (imageBlob: Blob): Promise<string> => {
  try {
    const ai = getAiClient();
    const base64Data = await blobToBase64(imageBlob);

    const prompt = `
      Identify the single game asset in this image. 
      Return ONLY a short, descriptive filename in snake_case (e.g., iron_sword, health_potion, ammo_box).
      Do not add file extensions. Do not add markdown formatting.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Data
            }
          },
          { text: prompt }
        ]
      }
    });

    const text = response.text?.trim() || 'unknown_item';
    // Clean up any accidental markdown or whitespace
    return text.replace(/`/g, '').replace(/\n/g, '').trim();

  } catch (error) {
    console.error("Gemini API Error:", error);
    return 'unknown_item';
  }
};
