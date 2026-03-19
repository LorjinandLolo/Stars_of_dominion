import useSWR from 'swr';
import { useEffect } from 'react';
import { useUIStore } from '@/lib/store/ui-store';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useGameSync() {
    const setFleets = useUIStore(s => s.setFleets);
    const setNowSeconds = useUIStore(s => s.setNowSeconds);
    const playerFactionId = useUIStore(s => s.playerFactionId);

    const { data } = useSWR(
        '/api/game/state',
        fetcher,
        { 
            refreshInterval: 2000, // Poll every 2 seconds
            revalidateOnFocus: true 
        }
    );

    useEffect(() => {
        if (data && !data.error) {
            if (data.fleets) setFleets(data.fleets);
            if (data.nowSeconds !== undefined) setNowSeconds(data.nowSeconds);
        }
    }, [data, setFleets, setNowSeconds]);

    return { 
        isLoading: !data, 
        error: data?.error 
    };
}
