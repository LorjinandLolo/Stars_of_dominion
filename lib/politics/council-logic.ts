/**
 * lib/politics/council-logic.ts
 * 
 * Logic for managing Galactic Council sessions, voting, and bloc influence.
 */

import { CouncilState } from '@/types/ui-state';

/**
 * Applies a player's vote to a specific resolution.
 * In a more complex sim, this would trigger weighted shifts in polarization.
 */
export function applyCouncilVote(
  currentState: CouncilState,
  resolutionId: string,
  voteValue: 'support' | 'oppose' | 'abstain'
): Partial<CouncilState> {
  let { legitimacy, polarization, cohesion } = currentState;

  if (voteValue === 'support') {
    legitimacy = Math.min(100, legitimacy + 2);
    cohesion = Math.min(100, cohesion + 1);
    polarization = Math.max(0, polarization - 1);
  } else if (voteValue === 'oppose') {
    polarization = Math.min(100, polarization + 5);
    cohesion = Math.max(0, cohesion - 3);
  }

  return { legitimacy, polarization, cohesion };
}

/**
 * Injects influence into a specific bloc.
 */
export function supportBloc(
  currentState: CouncilState,
  blocId: string
): Partial<CouncilState> {
  if (!currentState.blocs) return {};

  const updatedBlocs = currentState.blocs.map(bloc => {
    if (bloc.id === blocId) {
      return { ...bloc, influenceScore: Math.min(100, bloc.influenceScore + 5) };
    }
    // If we support one bloc, others naturally lose relative influence
    return { ...bloc, influenceScore: Math.max(0, bloc.influenceScore - 2) };
  });

  // Re-normalize influence if necessary (simplified here)
  return { blocs: updatedBlocs, polarization: Math.min(100, currentState.polarization + 2) };
}

/**
 * Boosts Council legitimacy through direct lobbying.
 */
export function lobbyCouncil(
  currentState: CouncilState
): Partial<CouncilState> {
  return {
    legitimacy: Math.min(100, currentState.legitimacy + 10),
    corruptionExposure: Math.min(100, currentState.corruptionExposure + 5),
    cohesion: Math.min(100, currentState.cohesion + 5)
  };
}
