// lib/manual/types.ts
// Stars of Dominion — Manual System Type Definitions

export type ManualBlockType = 
    | 'paragraph' 
    | 'bullet_list' 
    | 'table' 
    | 'strategy_tip' 
    | 'warning' 
    | 'example' 
    | 'formula';

export interface ManualContentBlock {
    type: ManualBlockType;
    title?: string;
    content: string | string[] | Record<string, string>[];
}

export interface ManualSubsection {
    id: string;
    title: string;
    blocks: ManualContentBlock[];
}

export interface ManualSection {
    id: string;
    title: string;
    icon?: string; // Lucide icon name or generic category
    introduction?: string;
    subsections: ManualSubsection[];
}

export interface ManualData {
    sections: ManualSection[];
}
