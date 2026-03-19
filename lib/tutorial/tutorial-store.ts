'use client';
// lib/tutorial/tutorial-store.ts
// Stars of Dominion — Tutorial Progress Zustand Store

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TutorialState } from './tutorial-types';
import { TUTORIAL_STEPS } from './tutorial-data';

interface TutorialStore extends TutorialState {
    start: () => void;
    next: () => void;
    prev: () => void;
    skip: () => void;
    goToStep: (index: number) => void;
    restart: () => void;
    currentStep: () => typeof TUTORIAL_STEPS[number] | null;
    totalSteps: number;
    isLastStep: () => boolean;
}

export const useTutorialStore = create<TutorialStore>()(
    persist(
        (set, get) => ({
            // ── State ──
            isActive: false,
            hasEverStarted: false,
            currentStepIndex: 0,
            completedStepIds: [],
            totalSteps: TUTORIAL_STEPS.length,

            // ── Actions ──
            start: () => set({ isActive: true, hasEverStarted: true, currentStepIndex: 0 }),

            next: () => {
                const { currentStepIndex, completedStepIds } = get();
                const currentStep = TUTORIAL_STEPS[currentStepIndex];
                const newCompleted = currentStep
                    ? [...new Set([...completedStepIds, currentStep.id])]
                    : completedStepIds;

                const nextIndex = currentStepIndex + 1;
                if (nextIndex >= TUTORIAL_STEPS.length) {
                    set({ isActive: false, completedStepIds: newCompleted });
                } else {
                    set({ currentStepIndex: nextIndex, completedStepIds: newCompleted });
                }
            },

            prev: () => {
                const { currentStepIndex } = get();
                if (currentStepIndex > 0) {
                    set({ currentStepIndex: currentStepIndex - 1 });
                }
            },

            skip: () => set({ isActive: false }),

            goToStep: (index) => {
                if (index >= 0 && index < TUTORIAL_STEPS.length) {
                    set({ currentStepIndex: index });
                }
            },

            restart: () => set({
                isActive: true,
                currentStepIndex: 0,
                completedStepIds: [],
            }),

            currentStep: () => {
                const { currentStepIndex } = get();
                return TUTORIAL_STEPS[currentStepIndex] ?? null;
            },

            isLastStep: () => {
                const { currentStepIndex } = get();
                return currentStepIndex >= TUTORIAL_STEPS.length - 1;
            },
        }),
        {
            name: 'stars-of-dominion-tutorial',
            partialize: (state) => ({
                hasEverStarted: state.hasEverStarted,
                completedStepIds: state.completedStepIds,
                currentStepIndex: state.currentStepIndex,
            }),
        }
    )
);
