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
            // Error 401 code: 'user_session_already_exists'
            if (error.code === 401 || error.message?.includes("session is active")) {
                console.log("Session already active, proceeding to lobby.");
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
