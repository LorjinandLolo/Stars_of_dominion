// lib/ai/llm-provider.ts

import { LLMProviderType, FactionContextSummary } from '../politics/faction-discourse-types';
import { OllamaProvider } from './providers/ollama-provider';
import { TemplateProvider } from './providers/template-provider';
import { MockProvider } from './providers/mock-provider';

const LLM_PROVIDER = (process.env.LLM_PROVIDER as LLMProviderType) || 'ollama';

interface LLMProviderInterface {
  generateFactionReply(input: {
    systemPrompt: string;
    userPrompt: string;
    context?: FactionContextSummary;
  }): Promise<{ text: string; provider: LLMProviderType; model?: string; fallbackReason?: string }>;
}

export function getLLMProvider(type: LLMProviderType = LLM_PROVIDER): LLMProviderInterface {
  switch (type) {
    case 'ollama':
      return new OllamaProvider() as any;
    case 'template':
      return new TemplateProvider() as any;
    case 'mock':
    default:
      return new MockProvider() as any;
  }
}

/**
 * Centrally managed generation with automatic fallback capability.
 */
export async function safeGenerateFactionReply(input: {
  systemPrompt: string;
  userPrompt: string;
  context: FactionContextSummary;
}): Promise<{ text: string; provider: LLMProviderType; model?: string; fallbackReason?: string }> {
  
  // 1. Try Primary (Ollama)
  if (LLM_PROVIDER === 'ollama') {
    try {
      const provider = new OllamaProvider();
      return await provider.generateFactionReply(input);
    } catch (e: any) {
      console.warn(`[LLM] Ollama failed, falling back to Template. Error: ${e.message}`);
      const fallback = new TemplateProvider();
      return await fallback.generateFactionReply({ ...input, context: input.context });
    }
  }

  // 2. Try Secondary (Template)
  if (LLM_PROVIDER === 'template') {
    try {
      const provider = new TemplateProvider();
      return await provider.generateFactionReply(input);
    } catch (e: any) {
      console.warn(`[LLM] Template failed, falling back to Mock. Error: ${e.message}`);
      const fallback = new MockProvider();
      return await fallback.generateFactionReply(input);
    }
  }

  // 3. Fallback to Mock
  const mock = new MockProvider();
  return await mock.generateFactionReply(input);
}
