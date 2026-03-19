// lib/tutorial/tutorial-types.ts
// Stars of Dominion — Tutorial System Types

export type TutorialCategory =
    | 'navigation'
    | 'galaxy'
    | 'economy'
    | 'research'
    | 'diplomacy'
    | 'espionage'
    | 'crisis'
    | 'time'
    | 'victory';

export interface TutorialStep {
    id: string;
    title: string;
    body: string;
    /** ID attribute of the DOM element to spotlight. null = center screen. */
    targetElementId: string | null;
    category: TutorialCategory;
    /** NavTab to open before showing this step (optional). */
    requiredTab?: string;
    isOptional?: boolean;
}

export interface TutorialState {
    isActive: boolean;
    hasEverStarted: boolean;
    currentStepIndex: number;
    completedStepIds: string[];
}
