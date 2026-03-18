// lib/ai/providers/template-provider.ts

import { LLMProviderType, FactionContextSummary } from '../../politics/faction-discourse-types';

export class TemplateProvider {
  /**
   * Generates a deterministic reply using a local context summary.
   * Note: This usually receives the system+user prompt from the orchestrator,
   * but for the template provider we might need the actual structural context.
   */
  async generateFactionReply(input: {
    systemPrompt: string;
    userPrompt: string;
    context?: FactionContextSummary;
  }): Promise<{ text: string; provider: LLMProviderType; model?: string }> {
    const context = input.context;
    
    if (!context) {
      return {
        text: "The transmission is garbled. Static fills the channel as the faction's representative remains silent.",
        provider: 'template'
      };
    }

    const { faction, speaker } = context;
    const mood = faction.satisfaction > 70 ? 'satisfied' : faction.satisfaction < 30 ? 'angry' : 'neutral';

    let reply = "";

    // Simplified branch logic
    if (faction.id === 'military') {
      if (mood === 'angry') {
        reply = `General Vax stares coldly through the terminal. "The fleet is underfunded and our borders are porous, yet you waste time with talk. We do not need discourse; we need steel and manpower."`;
      } else if (mood === 'satisfied') {
        reply = `General Vax nods in approval. "Strategic readiness is at its peak. The military hierarchy stands ready to enforce your will across the sector."`;
      } else {
        reply = `General Vax checks a tactical summary. "Reports are coming in. The situation is stable, but we cannot afford complacency. Speak your query."`;
      }
    } else if (faction.id === 'trade') {
      if (mood === 'satisfied') {
        reply = `Baron Silas Merrow smiles broadly. "A profitable era for us all! The Syndicate is pleased with the current trajectory of the markets. What further ventures do you propose?"`;
      } else if (mood === 'angry') {
        reply = `Baron Silas Merrow looks displeased. "These regulations are strangling the flow of credits. My associates are starting to wonder if their investment in your administration was a mistake."`;
      } else {
        reply = `Baron Silas Merrow adjusts his cufflink. "Business is business, but let's see if we can find a mutually beneficial arrangement. What's the bottom line?"`;
      }
    } else if (faction.id === 'populist') {
      if (mood === 'angry') {
        reply = `Tribune Tern is visibly agitated. "The streets are crowded with the hungry while the High Council debates abstractions! The people have reached their limit!"`;
      } else {
        reply = `Tribune Tern speaks firmly. "We are watching every move you make. The citizens expect justice, not just efficiency."`;
      }
    } else if (faction.id === 'technocrat') {
      reply = `${speaker.name} adjusts their ocular implant. "The current variables suggest ${faction.satisfaction < 50 ? 'serious inefficiencies' : 'optimal progress'}. We expect further data before reaching a conclusive stance."`;
    } else if (faction.id === 'spiritual') {
      reply = `High Voice Seraphel gazes past the camera. "The stars tell of a great ${faction.satisfaction < 50 ? 'shadow falling upon our destiny' : 'alignment of faith and power'}. Tread carefully, child of the void."`;
    } else {
      // Generic fallback
      reply = `${speaker.name} (${speaker.title}) is currently evaluating your position based on the ${faction.satisfaction}% satisfaction index. "We have received your message and will deliberate on its implications."`;
    }

    return {
      text: reply,
      provider: 'template'
    };
  }
}
