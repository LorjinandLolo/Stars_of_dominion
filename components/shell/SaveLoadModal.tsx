'use client';
// components/shell/SaveLoadModal.tsx
// Stars of Dominion — Save / Load Game State Modal

import React, { useEffect, useState } from 'react';
import { Save, FolderOpen, Trash2, X, Loader2 } from 'lucide-react';
import { saveGameAction, loadGameAction, listSavesAction, deleteSaveAction } from '@/app/actions/save-load';
import { useUIStore } from '@/lib/store/ui-store';

interface SaveSlot {
    id: string;
    saveName: string;
    savedAt: string;
    tickIndex: number;
    nowSeconds: number;
}

interface SaveLoadModalProps {
    isOpen: boolean;
    onClose: () => void;
    factionId: string;
}

export default function SaveLoadModal({ isOpen, onClose, factionId }: SaveLoadModalProps) {
    const [saves, setSaves] = useState<SaveSlot[]>([]);
    const [saveName, setSaveName] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);

    useEffect(() => {
        if (isOpen) fetchSaves();
    }, [isOpen, factionId]);

    const fetchSaves = async () => {
        const s = await listSavesAction(factionId);
        setSaves(s as SaveSlot[]);
    };

    const handleSave = async () => {
        if (!saveName.trim()) return;
        setLoading(true);
        const res = await saveGameAction(saveName.trim(), factionId);
        setLoading(false);
        setStatus({ msg: res.success ? 'Game saved!' : (res.error ?? 'Failed.'), ok: !!res.success });
        if (res.success) { setSaveName(''); fetchSaves(); }
    };

    const handleLoad = async (saveId: string) => {
        setLoading(true);
        const res = await loadGameAction(saveId);
        setLoading(false);
        setStatus({ msg: res.success ? 'Game loaded!' : (res.error ?? 'Failed.'), ok: !!res.success });
    };

    const handleDelete = async (saveId: string) => {
        setLoading(true);
        await deleteSaveAction(saveId);
        setLoading(false);
        fetchSaves();
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[480px] max-h-[600px] flex flex-col rounded-2xl border border-white/15 bg-slate-950/98 shadow-2xl shadow-black/80">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <div>
                        <h2 className="text-sm font-display uppercase tracking-widest text-white">Chronicle Vault</h2>
                        <p className="text-[10px] text-slate-500">Save &amp; Load Game State</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Save input */}
                <div className="px-6 py-4 border-b border-white/10">
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-2">Save Current State</p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={saveName}
                            onChange={e => setSaveName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSave()}
                            placeholder="Enter save name..."
                            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                        <button
                            onClick={handleSave}
                            disabled={loading || !saveName.trim()}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-display transition-all disabled:opacity-40"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save
                        </button>
                    </div>
                    {status && (
                        <p className={`text-[11px] mt-2 ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                            {status.msg}
                        </p>
                    )}
                </div>

                {/* Save list */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-3">Saved States ({saves.length})</p>
                    {saves.length === 0 ? (
                        <div className="text-center py-8 text-slate-600 text-sm">No saved states yet.</div>
                    ) : (
                        <div className="space-y-2">
                            {saves.map(s => (
                                <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/5 transition-colors">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-white truncate font-display">{s.saveName}</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">
                                            Cycle #{s.tickIndex} · {new Date(s.savedAt).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => handleLoad(s.id)}
                                            disabled={loading}
                                            title="Load this save"
                                            className="p-2 rounded-lg hover:bg-green-950/40 text-slate-400 hover:text-green-400 transition-colors"
                                        >
                                            <FolderOpen className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(s.id)}
                                            disabled={loading}
                                            title="Delete this save"
                                            className="p-2 rounded-lg hover:bg-red-950/40 text-slate-400 hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
