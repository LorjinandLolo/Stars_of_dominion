"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth-service';
import { getBrowserClients } from '@/lib/appwrite-browser';
import { ID } from 'appwrite';

export default function LoginForm() {
    const router = useRouter();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [existingUser, setExistingUser] = useState<{ email: string; name: string } | null>(null);

    // Show who is ALREADY signed in — logging in blind was how accounts got
    // mixed up. The player can continue as-is or knowingly switch.
    React.useEffect(() => {
        authService.getCurrentUser().then(u => {
            if (u) setExistingUser({ email: u.email, name: u.name });
        });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { account } = getBrowserClients();
            if (isLogin) {
                await authService.login(email, password);
            } else {
                const { account } = getBrowserClients();
                await account.create(ID.unique(), email, password, name);
                await authService.login(email, password);
            }
            router.push('/lobby');
        } catch (err: any) {
            console.error("Auth error:", err);
            setError(err.message || "An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    // Dev-only quick logins — one click straight into a test account,
    // so playtests never stumble over typed credentials again.
    const isDev = process.env.NODE_ENV === 'development';
    const quickLogin = async (devEmail: string) => {
        setLoading(true);
        setError(null);
        try {
            await authService.login(devEmail, 'password123');
            router.push('/lobby');
        } catch (err: any) {
            setError(err.message || 'Quick login failed — run: npm run setup:duel');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md p-8 rounded-2xl border border-slate-700/50 bg-slate-900/80 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
            {/* Animated background glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-700" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-all duration-700" />

            <div className="relative z-10">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-white tracking-tight mb-2">
                        {isLogin ? 'Access Terminal' : 'Enlist in the Fleet'}
                    </h2>
                    <p className="text-slate-400 text-sm">
                        {isLogin ? 'Enter your credentials to continue your dominion.' : 'Create a new identity for the stars.'}
                    </p>
                </div>

                {existingUser && (
                    <div className="mb-6 p-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5">
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                            You are currently signed in as{' '}
                            <span className="text-emerald-300 font-semibold">{existingUser.email}</span>
                            {existingUser.name ? <span className="text-slate-500"> ({existingUser.name})</span> : null}.
                        </p>
                        <div className="flex gap-2 mt-2.5">
                            <button
                                type="button"
                                onClick={() => router.push('/lobby')}
                                className="flex-1 py-2 bg-emerald-600/80 hover:bg-emerald-500/80 text-white text-xs font-bold rounded-lg transition-all"
                            >
                                Continue as this account →
                            </button>
                        </div>
                        <p className="text-[9px] text-slate-500 mt-2">
                            Or log in below with different credentials — the current session will be replaced.
                        </p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    {!isLogin && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Commander Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required={!isLogin}
                                className="w-full px-4 py-3 bg-slate-950/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                placeholder="Your callsign..."
                            />
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Secure Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full px-4 py-3 bg-slate-950/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                            placeholder="name@sector.com"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Vortex Key</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-4 py-3 bg-slate-950/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                            placeholder="••••••••"
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs animate-shake">
                            ⚠ {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-lg shadow-lg shadow-blue-900/20 transform transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                    >
                        {loading ? (
                            <div className="flex items-center justify-center gap-2">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>Establishing Link...</span>
                            </div>
                        ) : (
                            <span>{isLogin ? 'Initiate Uplink' : 'Confirm Commission'}</span>
                        )}
                    </button>

                </form>

                <div className="mt-6 text-center">
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-slate-400 hover:text-white text-sm transition-colors"
                    >
                        {isLogin ? "Don't have an ID? Register now." : "Already have an ID? Signal back."}
                    </button>
                </div>

                {isDev && (
                    <div className="mt-5 pt-4 border-t border-slate-800">
                        <p className="text-[9px] uppercase tracking-widest text-slate-600 text-center mb-2">Dev quick login</p>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={loading}
                                onClick={() => quickLogin('dev1@stars.com')}
                                className="flex-1 py-2 rounded-lg border border-amber-600/40 bg-amber-900/20 hover:bg-amber-800/30 text-amber-300 text-[10px] font-bold tracking-wider transition-all disabled:opacity-50"
                            >
                                DEV 1 · Aurelian
                            </button>
                            <button
                                type="button"
                                disabled={loading}
                                onClick={() => quickLogin('dev2@stars.com')}
                                className="flex-1 py-2 rounded-lg border border-sky-600/40 bg-sky-900/20 hover:bg-sky-800/30 text-sky-300 text-[10px] font-bold tracking-wider transition-all disabled:opacity-50"
                            >
                                DEV 2 · Vektori
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
