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
            // ONLY swallow the genuine "already logged in" case. The old check
            // (`error.code === 401`) also matched invalid credentials — every
            // wrong password looked like a successful login, then the lobby
            // silently bounced the user back here with no error shown.
            if (error.type === 'user_session_already_exists' || error.message?.includes('session is active')) {
                console.log('Session already active, proceeding to lobby.');
                return true;
            }
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
