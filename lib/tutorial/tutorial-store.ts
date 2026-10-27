'use client';
// lib/tutorial/tutorial-store.ts
// Stars of Dominion — Tutorial Progress Zustand Store
//
// One tour runs at a time (lib/tutorial/tutorial-data.ts TOURS). The first
// visit starts "Your screen"; the ? button starts any of them.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TutorialState, TutorialStep } from './tutorial-types';
import { TOURS, type TourId } from './tutorial-data';

interface TutorialStore extends TutorialState {
    tourId: TourId;
    /** Tours the player has finished, for the launcher's ticks. */
    finishedTours: TourId[];
    /** A panel whose first-visit tip the player asked to see again (components/tutorial/PanelTip.tsx). */
    tipReplayTab: string | null;
    replayTip: (tab: string | null) => void;
    start: () => void;
    startTour: (id: TourId) => void;
    next: () => void;
    prev: () => void;
    skip: () => void;
    goToStep: (index: number) => void;
    restart: () => void;
    steps: () => TutorialStep[];
    currentStep: () => TutorialStep | null;
    totalSteps: number;
    isLastStep: () => boolean;
}

const stepsOf = (id: TourId): TutorialStep[] => (TOURS[id] ?? TOURS.screen).steps;

export const useTutorialStore = create<TutorialStore>()(
    persist(
        (set, get) => ({
            // ── State ──
            isActive: false,
            hasEverStarted: false,
            currentStepIndex: 0,
            completedStepIds: [],
            tourId: 'screen',
            finishedTours: [],
            tipReplayTab: null,
            replayTip: (tab) => set({ tipReplayTab: tab }),
            totalSteps: stepsOf('screen').length,

            // ── Actions ──
            start: () => get().startTour('screen'),

            startTour: (id) => set({
                isActive: true,
                hasEverStarted: true,
                tourId: id,
                currentStepIndex: 0,
                totalSteps: stepsOf(id).length,
            }),

            next: () => {
                const { currentStepIndex, completedStepIds, tourId, finishedTours } = get();
                const steps = stepsOf(tourId);
                const currentStep = steps[currentStepIndex];
                const newCompleted = currentStep
                    ? [...new Set([...completedStepIds, currentStep.id])]
                    : completedStepIds;

                const nextIndex = currentStepIndex + 1;
                if (nextIndex >= steps.length) {
                    set({ isActive: false, completedStepIds: newCompleted, finishedTours: [...new Set([...finishedTours, tourId])] });
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
                if (index >= 0 && index < stepsOf(get().tourId).length) {
                    set({ currentStepIndex: index });
                }
            },

            restart: () => get().startTour('screen'),

            steps: () => stepsOf(get().tourId),

            currentStep: () => {
                const { currentStepIndex, tourId } = get();
                return stepsOf(tourId)[currentStepIndex] ?? null;
            },

            isLastStep: () => {
                const { currentStepIndex, tourId } = get();
                return currentStepIndex >= stepsOf(tourId).length - 1;
            },
        }),
        {
            name: 'stars-of-dominion-tutorial',
            partialize: (state) => ({
                hasEverStarted: state.hasEverStarted,
                completedStepIds: state.completedStepIds,
                currentStepIndex: state.currentStepIndex,
                tourId: state.tourId,
                finishedTours: state.finishedTours,
            }),
            // A stored tour id from an older build may no longer exist.
            merge: (persisted, current) => {
                const p = (persisted ?? {}) as Partial<TutorialStore>;
                const tourId = p.tourId && TOURS[p.tourId] ? p.tourId : 'screen';
                return { ...current, ...p, tourId, totalSteps: stepsOf(tourId).length };
            },
        }
    )
);
