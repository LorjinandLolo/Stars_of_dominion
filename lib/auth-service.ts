import { Models } from 'appwrite';
import { getBrowserClients } from '@/lib/appwrite-browser';

export const authService = {
    async getCurrentUser(): Promise<Models.User<Models.Preferences> | null> {
        try {
            const { account } = getBrowserClients();
            // Dev Bypass: check localStorage for mock session
            if (typeof window !== 'undefined' && localStorage.getItem('dev_bypass') === 'true') {
                return {
                    $id: 'dev-user',
                    name: 'Dev Commander',
                    email: 'dev@stars.io',
                    registration: new Date().toISOString(),
                    status: true,
                    passwordUpdate: new Date().toISOString(),
                    emailVerification: true,
                    prefs: {},
                    accessedAt: new Date().toISOString(),
                } as Models.User<Models.Preferences>;
            }
            return await account.get();
        } catch (error) {
            return null;
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
