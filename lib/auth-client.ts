// lib/auth-client.ts — better-auth browser client (replaces Appwrite Account).

'use client';

import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
