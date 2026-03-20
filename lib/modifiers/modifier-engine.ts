// lib/modifiers/modifier-engine.ts

import { ModifierBundle } from '../civilization/types';

/**
 * The ModifierEngine handles the merging and calculation of game statistics.
 * It supports both Multiplicative (percentage-based) and Additive (flat) modifiers.
 */
export class ModifierEngine {
  
  /**
   * Calculates a final value for a given base and a stack of modifier bundles.
   * Formula: (Base + Sum of Flat Mods) * (1 + Sum of Percent Mods)
   * 
   * Note: This assumes standard strategy game logic where percent mods are additive with each other.
   */
  static apply(base: number, bundles: ModifierBundle[], key: string): number {
    let flatAdd = 0;
    let percentAdd = 0;

    for (const bundle of bundles) {
      const val = bundle[key];
      if (val === undefined) continue;

      // Convention: Values between -1 and 1 are treated as Percentages (e.g. 0.2 = +20%)
      // Values >= 1 or <= -1 are treated as Flat additions (e.g. 5 = +5 units)
      // Exception: If the key ends in '_flat', always treat as flat.
      // Exception: If the key ends in '_percent', always treat as percent.
      
      if (key.endsWith('_flat')) {
        flatAdd += val;
      } else if (key.endsWith('_percent')) {
        percentAdd += val;
      } else {
        if (Math.abs(val) < 1.0) {
          percentAdd += val;
        } else {
          flatAdd += val;
        }
      }
    }

    return (base + flatAdd) * (1 + percentAdd);
  }

  /**
   * Merges multiple bundles into a single resolved bundle of sums.
   */
  static merge(bundles: ModifierBundle[]): ModifierBundle {
    const resolved: ModifierBundle = {};

    for (const bundle of bundles) {
      for (const [key, val] of Object.entries(bundle)) {
        resolved[key] = (resolved[key] || 0) + val;
      }
    }

    return resolved;
  }

  /**
   * Helper to get a specific resolved modifier value from a stack.
   */
  static getModifier(bundles: ModifierBundle[], key: string): number {
    return bundles.reduce((acc, b) => acc + (b[key] || 0), 0);
  }
}
