
import { GoogleGenAI, Type } from "@google/genai";

// Always use the specified initialization format for the Google GenAI SDK
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Uses Gemini to extract license plate text from a camera frame
 */
export async function recognizeLicensePlate(base64Image: string): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: "Extract the license plate number from this image. Return only the alphanumeric plate string without spaces or symbols. If no plate is visible, return 'NONE'." }
        ]
      },
      config: {
        temperature: 0.1,
        topP: 1,
      }
    });

    // Access the text property directly from GenerateContentResponse
    const result = response.text?.trim().toUpperCase();
    return result === 'NONE' ? null : result;
  } catch (error) {
    console.error("LPR Error:", error);
    return null;
  }
}

/**
 * Analyze logs to find patterns or security anomalies
 */
export async function analyzeSecurityLogs(logs: any[]): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze these garage access logs and summarize suspicious activities or frequent visitors in 2-3 sentences: ${JSON.stringify(logs)}`,
    });
    // Access the text property directly from GenerateContentResponse
    return response.text || "No insights available.";
  } catch (error) {
    return "Error analyzing logs.";
  }
}
