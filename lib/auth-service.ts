// lib/auth-service.ts — thin wrapper over better-auth (replaces Appwrite Account).
// Keeps the historical surface ({ getCurrentUser, login, logout }) so consumers
// (LoginForm, LobbyScreen, GameShell, IdentityBadge) stay unchanged. `$id`
// mirrors the Appwrite user id field those components still read.

import { authClient } from '@/lib/auth-client';

export interface CurrentUser {
    $id: string;
    id: string;
    email: string;
    name: string;
}

export const authService = {
    async getCurrentUser(): Promise<CurrentUser | null> {
        try {
            const { data } = await authClient.getSession();
            if (!data?.user) return null;
            const { id, email, name } = data.user;
            return { $id: id, id, email, name: name ?? '' };
        } catch {
            return null;
        }
    },

    async login(email: string, pass: string) {
        // better-auth replaces any existing session on sign-in, so the old
        // "session already active" dance from Appwrite is gone.
        const { error } = await authClient.signIn.email({ email, password: pass });
        if (error) throw new Error(error.message ?? 'Login failed.');
    },

    async register(email: string, pass: string, name: string) {
        // Signs the new account in automatically on success.
        const { error } = await authClient.signUp.email({ email, password: pass, name });
        if (error) throw new Error(error.message ?? 'Registration failed.');
    },

    async logout() {
        try {
            await authClient.signOut();
            localStorage.removeItem('selectedFactionId');
            localStorage.removeItem('dev_bypass');
        } catch (error) {
            console.error("Logout error:", error);
        }
    }
};
