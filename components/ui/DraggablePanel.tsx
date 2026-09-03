"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Move } from 'lucide-react';

interface DraggablePanelProps {
    title: string;
    children: React.ReactNode;
    initialPos: { x: number; y: number; w: number; h: number };
    onClose: () => void;
    onUpdatePos: (pos: { x: number; y: number; w: number; h: number }) => void;
}

const EDGE_MARGIN = 8;
const MIN_W = 360;
const MIN_H = 280;

/**
 * Keep a window inside the viewport. The store seeds every float at
 * 800×600 @ (100,100), which on a narrow pane (the in-app preview is ~830px
 * wide) put the right third of the panel off-screen with no way to reach it.
 * Shrink to fit first, then slide back inside.
 */
function clampToViewport(p: { x: number; y: number; w: number; h: number }) {
    if (typeof window === 'undefined') return p;
    const maxW = Math.max(MIN_W, window.innerWidth - EDGE_MARGIN * 2);
    const maxH = Math.max(MIN_H, window.innerHeight - EDGE_MARGIN * 2);
    const w = Math.min(Math.max(MIN_W, p.w), maxW);
    const h = Math.min(Math.max(MIN_H, p.h), maxH);
    const x = Math.min(Math.max(EDGE_MARGIN, p.x), window.innerWidth - w - EDGE_MARGIN);
    const y = Math.min(Math.max(EDGE_MARGIN, p.y), window.innerHeight - h - EDGE_MARGIN);
    return { x, y, w, h };
}

export default function DraggablePanel({ title, children, initialPos, onClose, onUpdatePos }: DraggablePanelProps) {
    // Fitted on first render (the store seeds 800×600 blind), then re-fitted
    // whenever the viewport shrinks under the window.
    const [pos, setPos] = useState(() => clampToViewport(initialPos));
    const draggingRef = useRef(false);
    const resizingRef = useRef(false);
    const startPosRef = useRef({ x: 0, y: 0, px: 0, py: 0, pw: 0, ph: 0 });

    useEffect(() => {
        const fit = () => setPos(p => {
            const next = clampToViewport(p);
            return next.x === p.x && next.y === p.y && next.w === p.w && next.h === p.h ? p : next;
        });
        window.addEventListener('resize', fit);
        return () => window.removeEventListener('resize', fit);
    }, []);

    const handleMouseDown = (e: React.MouseEvent, type: 'drag' | 'resize') => {
        // Only left click
        if (e.button !== 0) return;
        
        e.preventDefault();
        draggingRef.current = type === 'drag';
        resizingRef.current = type === 'resize';
        startPosRef.current = {
            x: e.clientX,
            y: e.clientY,
            px: pos.x,
            py: pos.y,
            pw: pos.w,
            ph: pos.h
        };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!draggingRef.current && !resizingRef.current) return;

            const dx = e.clientX - startPosRef.current.x;
            const dy = e.clientY - startPosRef.current.y;

            if (draggingRef.current) {
                setPos(clampToViewport({
                    ...pos,
                    x: startPosRef.current.px + dx,
                    y: startPosRef.current.py + dy
                }));
            } else if (resizingRef.current) {
                setPos(clampToViewport({
                    ...pos,
                    w: startPosRef.current.pw + dx,
                    h: startPosRef.current.ph + dy
                }));
            }
        };

        const handleMouseUp = () => {
            if (draggingRef.current || resizingRef.current) {
                onUpdatePos(pos);
            }
            draggingRef.current = false;
            resizingRef.current = false;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [pos, onUpdatePos]);

    // Use portal to body
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted) return null;

    return createPortal(
        <div 
            style={{
                position: 'fixed',
                left: pos.x,
                top: pos.y,
                width: pos.w,
                height: pos.h,
                zIndex: 1000,
            }}
            className="flex flex-col bg-slate-950/98 backdrop-blur-2xl border border-slate-700/50 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden motion-safe:animate-in motion-safe:zoom-in-95 duration-200"
            onWheel={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div 
                className="flex items-center justify-between px-4 py-3 bg-slate-900/50 border-b border-slate-800/80 cursor-grab active:cursor-grabbing select-none shrink-0"
                onMouseDown={(e) => handleMouseDown(e, 'drag')}
            >
                <div className="flex items-center gap-3">
                    <Move size={14} className="text-slate-500" />
                    <span className="text-[10px] font-display tracking-widest text-slate-300 uppercase leading-none">{title}</span>
                </div>
                <button 
                    onClick={onClose}
                    className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded transition-colors text-slate-500"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-hidden relative bg-slate-950/40">
                <div className="absolute inset-0 overflow-y-auto custom-scrollbar">
                    {children}
                </div>
            </div>

            {/* Resize handle */}
            <div 
                className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-1 group z-10"
                onMouseDown={(e) => handleMouseDown(e, 'resize')}
            >
                <div className="w-2 h-2 border-r-2 border-b-2 border-slate-600 group-hover:border-amber-500/50 transition-colors rounded-br-sm" />
            </div>
        </div>,
        document.body
    );
}
