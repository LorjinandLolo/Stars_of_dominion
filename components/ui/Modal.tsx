"use client";

import React, { useEffect } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    wide?: boolean;
}

export default function Modal({ isOpen, onClose, title, children, wide }: ModalProps) {
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`bg-neutral-900 border border-neutral-700 w-full ${wide ? 'max-w-[1150px]' : 'max-w-2xl'} max-h-[90vh] flex flex-col rounded-lg shadow-[0_0_30px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-200`}>
                <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-950/50 rounded-t-lg">
                    <h2 className="text-lg font-bold text-white tracking-wide uppercase flex items-center gap-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_#3b82f6]"></span>
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-neutral-500 hover:text-white transition-colors p-1 hover:bg-neutral-800 rounded"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-neutral-900">
                    {children}
                </div>
            </div>
        </div>
    );
}
