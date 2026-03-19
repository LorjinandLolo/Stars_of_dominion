"use client";

import { Client, Account, Models } from 'appwrite';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT!);

const account = new Account(client);

export const authService = {
    async getCurrentUser(): Promise<Models.User<Models.Preferences> | null> {
        try {
            return await account.get();
        } catch (error) {
            return null;
        }
    },

    async logout() {
        try {
            await account.deleteSession('current');
            localStorage.removeItem('selectedFactionId');
        } catch (error) {
            console.error("Logout error:", error);
        }
    }
};
