// lib/civilization/registry.ts

import { CIVILIZATIONS } from './data/civilizations';
import { IDEOLOGIES } from './data/ideologies';
import { CivilizationDefinition, IdeologyDefinition } from './types';

export class CivilizationRegistry {
  private static civMap = new Map<string, CivilizationDefinition>(
    CIVILIZATIONS.map(c => [c.id, c])
  );

  private static ideologyMap = new Map<string, IdeologyDefinition>(
    IDEOLOGIES.map(i => [i.id, i])
  );

  static getCivilization(id: string): CivilizationDefinition | undefined {
    return this.civMap.get(id);
  }

  static getIdeology(id: string): IdeologyDefinition | undefined {
    return this.ideologyMap.get(id);
  }

  static getAllCivilizations(): CivilizationDefinition[] {
    return CIVILIZATIONS;
  }

  static getAllIdeologies(): IdeologyDefinition[] {
    return IDEOLOGIES;
  }
}
