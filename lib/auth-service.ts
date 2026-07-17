import { Models } from 'appwrite';
import { getBrowserClients } from '@/lib/appwrite-browser';

export const authService = {
    async getCurrentUser(): Promise<Models.User<Models.Preferences> | null> {
        try {
            const { account } = getBrowserClients();
            return await account.get();
        } catch (error) {
            return null;
        }
    },

    async login(email: string, pass: string) {
        const { account } = getBrowserClients();
        try {
            return await account.createEmailSession(email, pass);
        } catch (error: any) {
            // "Session already active": a PREVIOUS account is still signed in.
            // The old behavior kept that stale session and reported success — you
            // typed dev1's credentials but stayed logged in as whoever you were
            // before. Replace the old session with the requested account instead.
            if (error.type === 'user_session_already_exists' || error.message?.includes('session is active')) {
                console.log('Replacing existing session with new login...');
                try { await account.deleteSession('current'); } catch { /* best effort */ }
                return await account.createEmailSession(email, pass);
            }
            // Everything else (wrong password, unknown account) surfaces as a
            // real error — never masquerade as success.
            throw error;
        }
    },

    async logout() {
        try {
            const { account } = getBrowserClients();
            await account.deleteSession('current');
            localStorage.removeItem('selectedFactionId');
            localStorage.removeItem('dev_bypass');
        } catch (error) {
            console.error("Logout error:", error);
        }
    }
};
