// lib/ai/providers/gemini-provider.ts
// Stars of Dominion — Google Gemini AI Provider

import { GoogleGenerativeAI } from '@google/generative-ai';
import { LLMProviderType } from '../../politics/faction-discourse-types';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

export class GeminiProvider {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    if (GOOGLE_API_KEY) {
      this.genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
    }
  }

  async generateFactionReply(input: {
    systemPrompt: string;
    userPrompt: string;
  }): Promise<{ text: string; provider: LLMProviderType; model?: string }> {
    if (!this.genAI) {
      throw new Error('Google API Key is missing. Gemini provider is not initialized.');
    }

    try {
      const model = this.genAI.getGenerativeModel({ 
        model: GEMINI_MODEL,
        systemInstruction: input.systemPrompt,
      });

      const result = await model.generateContent(input.userPrompt);
      const response = await result.response;
      const text = response.text().trim();

      if (!text) {
        throw new Error('Gemini returned an empty response.');
      }

      return {
        text,
        provider: 'gemini',
        model: GEMINI_MODEL,
      };
    } catch (e: any) {
      console.error(`[LLM] Gemini API error: ${e.message}`);
      throw e;
    }
  }
}
