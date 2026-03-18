// lib/ai/providers/ollama-provider.ts

import { LLMProviderType } from '../../politics/faction-discourse-types';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:8b';
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 15000);

export class OllamaProvider {
  async generateFactionReply(input: {
    systemPrompt: string;
    userPrompt: string;
  }): Promise<{ text: string; provider: LLMProviderType; model?: string }> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [
            { role: 'system', content: input.systemPrompt },
            { role: 'user', content: input.userPrompt },
          ],
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.message?.content?.trim();

      if (!content) {
        throw new Error('Ollama returned an empty response.');
      }

      return {
        text: content,
        provider: 'ollama',
        model: OLLAMA_MODEL,
      };
    } finally {
      clearTimeout(id);
    }
  }
}
