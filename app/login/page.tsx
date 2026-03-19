"use client";

import React from 'react';
import LoginForm from '@/components/auth/LoginForm';

export default function LoginPage() {
    return (
        <div 
            className="min-h-screen flex items-center justify-center relative overflow-hidden bg-slate-950"
            style={{
                background: 'radial-gradient(circle at center, #0a0f1e 0%, #020409 100%)',
                fontFamily: "'Rajdhani', sans-serif"
            }}
        >
            {/* Animated Stars / Particles */}
            <div className="absolute inset-0 pointer-events-none opacity-40">
                <div className="absolute top-[20%] left-[30%] w-0.5 h-0.5 bg-white rounded-full animate-pulse shadow-[0_0_10px_white]" />
                <div className="absolute top-[60%] left-[10%] w-0.5 h-0.5 bg-white rounded-full animate-pulse shadow-[0_0_10px_white]" style={{ animationDelay: '1s' }} />
                <div className="absolute top-[40%] left-[80%] w-0.5 h-0.5 bg-white rounded-full animate-pulse shadow-[0_0_10px_white]" style={{ animationDelay: '1.5s' }} />
                <div className="absolute top-[80%] left-[70%] w-0.5 h-0.5 bg-white rounded-full animate-pulse shadow-[0_0_10px_white]" style={{ animationDelay: '0.5s' }} />
                <div className="absolute top-[10%] left-[90%] w-0.5 h-0.5 bg-white rounded-full animate-pulse shadow-[0_0_10px_white]" style={{ animationDelay: '2s' }} />
            </div>

            {/* Glowing Nebulae */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-indigo-900/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="relative z-10 w-full flex flex-col items-center px-4">
                <div className="mb-8 text-center">
                    <div className="text-blue-500 font-bold text-xs tracking-[0.5em] uppercase mb-2 animate-pulse">Neural Link Required</div>
                    <h1 className="text-6xl font-black text-white tracking-tight leading-none italic" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                        STARS OF <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">DOMINION</span>
                    </h1>
                </div>
                
                <LoginForm />

                <div className="mt-12 flex items-center gap-8 text-slate-600 font-medium tracking-widest text-[10px] uppercase">
                    <span className="hover:text-slate-400 cursor-help transition-colors text-blue-900/40">v0.1.0-alpha</span>
                    <span className="w-1 h-1 bg-slate-800 rounded-full" />
                    <span className="hover:text-slate-400 cursor-help transition-colors text-blue-900/40">Secure Sector 7G</span>
                    <span className="w-1 h-1 bg-slate-800 rounded-full" />
                    <span className="hover:text-slate-400 cursor-help transition-colors text-blue-900/40">Deepmind Optimized</span>
                </div>
            </div>

            <style jsx global>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-4px); }
                    75% { transform: translateX(4px); }
                }
                .animate-shake {
                    animation: shake 0.2s ease-in-out 0s 2;
                }
            `}</style>
        </div>
    );
}
