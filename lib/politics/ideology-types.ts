// lib/politics/ideology-types.ts

/**
 * An empire's evolving ideological identity across 7 fundamental axes.
 * Each axis ranges continuously from -100 to +100.
 */
export interface IdeologyProfile {
    /** +100 = Order (Strict hierarchy) <-> -100 = Chaos (Anarchy/Flux) */
    order_chaos: number;
    /** +100 = Centralized <-> -100 = Autonomous (Federalized) */
    centralization_autonomy: number;
    /** +100 = Militarist <-> -100 = Pacifist */
    militarism_pacifism: number;
    /** +100 = Tradition (Conservative) <-> -100 = Progress (Reformist/Tech) */
    tradition_progress: number;
    /** +100 = Collectivism <-> -100 = Individualism */
    collectivism_individualism: number;
    /** +100 = Expansionist <-> -100 = Isolationist */
    expansionism_isolationism: number;
    /** +100 = Authoritarian <-> -100 = Liberty */
    authoritarianism_liberty: number;
}

export type IdeologyAxis = keyof IdeologyProfile;
