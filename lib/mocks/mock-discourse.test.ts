import { DiscourseState } from '@/types/ui-state';

export const mockDiscourseState: DiscourseState = {
    activeFactionId: 'military',
    messages: {
        'military': [
            { id: 'm1', speaker: 'faction', content: 'Supreme Hegemon, the fleet is ready for your command, but the logistics are strained.', timestamp: 1773664309 },
        ]
    },
    isGenerating: false
};
