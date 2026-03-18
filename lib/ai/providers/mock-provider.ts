// lib/ai/providers/mock-provider.ts

import { LLMProviderType } from '../../politics/faction-discourse-types';

export class MockProvider {
  async generateFactionReply(input: {
    systemPrompt: string;
    userPrompt: string;
  }): Promise<{ text: string; provider: LLMProviderType; model?: string }> {
    return {
      text: "[MOCK RESPONSE] We are evaluating your message. Our stance remains unchanged pending further simulation updates.",
      provider: 'mock',
      model: 'debug-v1'
    };
  }
}
