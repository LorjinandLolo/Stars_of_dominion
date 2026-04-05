"use client";

import { Client, Account, Models } from 'appwrite';

function getAccount(): Account {
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
    const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT;

    const client = new Client();
    if (endpoint) client.setEndpoint(endpoint);
    if (project) client.setProject(project || '');
    
    return new Account(client);
}

export const authService = {
    async getCurrentUser(): Promise<Models.User<Models.Preferences> | null> {
        try {
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
            return await getAccount().get();
        } catch (error) {
            return null;
        }
    },

    async logout() {
        try {
            await getAccount().deleteSession('current');
            localStorage.removeItem('selectedFactionId');
            localStorage.removeItem('dev_bypass');
        } catch (error) {
            console.error("Logout error:", error);
        }
    }
};
