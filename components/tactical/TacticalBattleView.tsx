"use client";

// components/tactical/TacticalBattleView.tsx
// Stars of Dominion — real-time tactical battle view (V1).
//
// Full-screen canvas renderer over the mutation-in-place sim in lib/tactical.
// The BattleState lives in a ref and is mutated by the rAF loop and player
// orders; React only re-renders the DOM HUD on a slow 250ms tick. The player
// enters/retreats on the LEFT edge, the enemy on the RIGHT.

import React from 'react';
import type { BattleResult, BattleState, TacticalShip, Torpedo } from '@/lib/tactical/types';
import { SHIP_CLASSES } from '@/lib/tactical/ship-defs';
import {
    activeDeploymentPoints,
    computeResult,
    createBattle,
    deployReinforcement,
    fleetWithdraw,
    issueMove,
    orderRetreat,
    setTarget,
    update,
    useAbility as triggerAbility,
} from '@/lib/tactical/sim';
import {
    defaultEnemyPlan,
    fleetsStrength,
    fleetsToReserves,
    type StrategicFleetLike,
} from '@/lib/tactical/fleet-adapter';
import { FastForward, Flag, Pause, Play, X, Zap } from 'lucide-react';

const TAU = Math.PI * 2;
const ARRIVAL_WARP_SECONDS = 4;   // mirrors ARRIVAL_DELAY in lib/tactical/sim.ts
const BEAM_FADE_SECONDS = 0.12;   // mirrors beam expiry in lib/tactical/sim.ts
const DRAG_THRESHOLD_PX = 5;
const MAX_SELECTED_ROWS = 6;

interface TacticalBattleViewProps {
    title?: string;
    playerFleets: StrategicFleetLike[];
    enemyFleets: StrategicFleetLike[];
    enemyName?: string;
    /** Player closed the battle before any resolution (only offered pre-outcome). */
    onAbort: () => void;
    /** Battle is over and the player clicked RETURN TO GALAXY. */
    onFinish: (result: BattleResult) => void;
}

interface ViewState {
    scale: number;
    ox: number;
    oy: number;
    cw: number;
    ch: number;
}

interface DragState {
    /** 0 = left, 2 = right. */
    button: number;
    startX: number;
    startY: number;
    curX: number;
    curY: number;
    moved: boolean;
    shift: boolean;
}

interface Star {
    x: number;
    y: number;
    r: number;
    a: number;
}

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function fmtTime(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function sumComposition(composition: Record<string, number>): number {
    return Object.values(composition).reduce((a, b) => a + b, 0);
}

export default function TacticalBattleView({
    title = 'TACTICAL ENGAGEMENT',
    playerFleets,
    enemyFleets,
    enemyName = 'Enemy Fleet',
    onAbort,
    onFinish,
}: TacticalBattleViewProps) {
    // ── Sim state (never in React state — the render loop reads the ref) ──
    const stateRef = React.useRef<BattleState | null>(null);
    if (stateRef.current === null) {
        stateRef.current = createBattle({
            playerReserves: fleetsToReserves(playerFleets),
            enemyReserves: fleetsToReserves(enemyFleets),
            playerStrength: fleetsStrength(playerFleets),
            enemyStrength: fleetsStrength(enemyFleets),
            enemyPlan: defaultEnemyPlan(),
        });
    }
    const state = stateRef.current;

    const starsRef = React.useRef<Star[] | null>(null);
    if (starsRef.current === null) {
        const rand = mulberry32(0x5eed5);
        starsRef.current = Array.from({ length: 170 }, () => ({
            x: rand() * state.width,
            y: rand() * state.height,
            r: 0.4 + rand() * 1.1,
            a: 0.15 + rand() * 0.55,
        }));
    }

    // ── Speed / selection (mirrored into refs for the render loop) ──
    const [speed, setSpeedState] = React.useState(1);
    const speedRef = React.useRef(1);
    const setSpeed = (v: number) => {
        speedRef.current = v;
        setSpeedState(v);
    };

    const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
    const selectionRef = React.useRef<string[]>([]);
    const setSelection = React.useCallback((ids: string[]) => {
        selectionRef.current = ids;
        setSelectedIds(ids);
    }, []);

    const [confirmingWithdraw, setConfirmingWithdraw] = React.useState(false);
    React.useEffect(() => {
        if (!confirmingWithdraw) return;
        const t = setTimeout(() => setConfirmingWithdraw(false), 3000);
        return () => clearTimeout(t);
    }, [confirmingWithdraw]);

    // Slow HUD refresh: the sim mutates in place, so poke React every 250ms.
    const [, forceHud] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => {
        const t = setInterval(() => {
            const st = stateRef.current;
            if (st) {
                const live = selectionRef.current.filter(id => {
                    const sh = st.ships.find(s => s.id === id);
                    return !!sh && (sh.status === 'active' || sh.status === 'retreating');
                });
                if (live.length !== selectionRef.current.length) {
                    selectionRef.current = live;
                    setSelectedIds(live);
                }
            }
            forceHud();
        }, 250);
        return () => clearInterval(t);
    }, []);

    const wrapperRef = React.useRef<HTMLDivElement | null>(null);
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const viewRef = React.useRef<ViewState>({ scale: 1, ox: 0, oy: 0, cw: 0, ch: 0 });
    const dragRef = React.useRef<DragState | null>(null);

    // ── Canvas loop, camera and input ──
    React.useEffect(() => {
        const canvas = canvasRef.current;
        const wrapper = wrapperRef.current;
        if (!canvas || !wrapper) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const fit = () => {
            const st = stateRef.current;
            if (!st) return;
            const cw = wrapper.clientWidth;
            const ch = wrapper.clientHeight;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.max(1, Math.round(cw * dpr));
            canvas.height = Math.max(1, Math.round(ch * dpr));
            canvas.style.width = `${cw}px`;
            canvas.style.height = `${ch}px`;
            const scale = Math.min(cw / st.width, ch / st.height) || 1;
            viewRef.current = {
                scale,
                ox: (cw - st.width * scale) / 2,
                oy: (ch - st.height * scale) / 2,
                cw,
                ch,
            };
        };
        fit();
        window.addEventListener('resize', fit);

        const toLocal = (clientX: number, clientY: number) => {
            const rect = canvas.getBoundingClientRect();
            return { x: clientX - rect.left, y: clientY - rect.top };
        };
        const screenToWorld = (sx: number, sy: number) => {
            const v = viewRef.current;
            return { x: (sx - v.ox) / v.scale, y: (sy - v.oy) / v.scale };
        };

        const shipAt = (
            st: BattleState,
            wx: number,
            wy: number,
            pred: (sh: TacticalShip) => boolean
        ): TacticalShip | null => {
            let best: TacticalShip | null = null;
            let bestDist = Infinity;
            for (const sh of st.ships) {
                if (!pred(sh)) continue;
                const d = Math.hypot(sh.x - wx, sh.y - wy);
                const grab = Math.max(SHIP_CLASSES[sh.classId].radius + 6, 14);
                if (d <= grab && d < bestDist) {
                    best = sh;
                    bestDist = d;
                }
            }
            return best;
        };

        // ── Mouse ──
        const onMouseDown = (e: MouseEvent) => {
            const st = stateRef.current;
            if (!st || st.outcome) return;
            if (e.button !== 0 && e.button !== 2) return;
            const p = toLocal(e.clientX, e.clientY);
            dragRef.current = {
                button: e.button,
                startX: p.x,
                startY: p.y,
                curX: p.x,
                curY: p.y,
                moved: false,
                shift: e.shiftKey,
            };
            e.preventDefault();
        };

        const onMouseMove = (e: MouseEvent) => {
            const d = dragRef.current;
            if (!d) return;
            const p = toLocal(e.clientX, e.clientY);
            d.curX = p.x;
            d.curY = p.y;
            if (!d.moved && Math.hypot(p.x - d.startX, p.y - d.startY) > DRAG_THRESHOLD_PX) {
                d.moved = true;
            }
        };

        const onMouseUp = (e: MouseEvent) => {
            const d = dragRef.current;
            if (!d || e.button !== d.button) return;
            dragRef.current = null;
            const st = stateRef.current;
            if (!st || st.outcome) return;
            const p = toLocal(e.clientX, e.clientY);
            const wp = screenToWorld(p.x, p.y);

            // Right button: move order. Press point is the destination; a drag
            // sets the final facing along the drag vector.
            if (d.button === 2) {
                const sel = selectionRef.current;
                if (!sel.length) return;
                const dest = screenToWorld(d.startX, d.startY);
                if (d.moved) {
                    const face = Math.atan2(wp.y - dest.y, wp.x - dest.x);
                    issueMove(st, sel, dest.x, dest.y, face);
                } else {
                    issueMove(st, sel, dest.x, dest.y, null);
                }
                return;
            }

            // Left drag: box-select own active ships.
            if (d.moved) {
                const a = screenToWorld(d.startX, d.startY);
                const x0 = Math.min(a.x, wp.x);
                const x1 = Math.max(a.x, wp.x);
                const y0 = Math.min(a.y, wp.y);
                const y1 = Math.max(a.y, wp.y);
                const inBox = st.ships
                    .filter(sh =>
                        sh.side === 'player' && sh.status === 'active' &&
                        sh.x >= x0 && sh.x <= x1 && sh.y >= y0 && sh.y <= y1)
                    .map(sh => sh.id);
                setSelection(d.shift ? [...new Set([...selectionRef.current, ...inBox])] : inBox);
                return;
            }

            // Left click: own ship → select; enemy ship → target; empty → clear.
            const own = shipAt(st, wp.x, wp.y, sh => sh.side === 'player' && sh.status === 'active');
            if (own) {
                if (d.shift) {
                    const cur = selectionRef.current;
                    setSelection(cur.includes(own.id) ? cur.filter(id => id !== own.id) : [...cur, own.id]);
                } else {
                    setSelection([own.id]);
                }
                return;
            }
            const hostile = shipAt(st, wp.x, wp.y, sh =>
                sh.side === 'enemy' && (sh.status === 'active' || sh.status === 'retreating'));
            if (hostile && selectionRef.current.length) {
                setTarget(st, selectionRef.current, hostile.id);
                return;
            }
            if (!d.shift) setSelection([]);
        };

        const onContextMenu = (e: MouseEvent) => e.preventDefault();

        const onKeyDown = (e: KeyboardEvent) => {
            const st = stateRef.current;
            if (!st || st.outcome) return;
            if (e.key === 'Escape') {
                setSelection([]);
            } else if (e.key === 'r' || e.key === 'R') {
                if (selectionRef.current.length) orderRetreat(st, selectionRef.current);
            }
        };

        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('contextmenu', onContextMenu);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('keydown', onKeyDown);

        // ── Drawing helpers (world space unless noted) ──

        const drawArrow = (x1: number, y1: number, x2: number, y2: number, color: string) => {
            const ang = Math.atan2(y2 - y1, x2 - x1);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - Math.cos(ang - 0.45) * 8, y2 - Math.sin(ang - 0.45) * 8);
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - Math.cos(ang + 0.45) * 8, y2 - Math.sin(ang + 0.45) * 8);
            ctx.stroke();
        };

        const drawWeaponArcs = (sh: TacticalShip) => {
            const def = SHIP_CLASSES[sh.classId];
            for (const w of def.weapons) {
                const mount = sh.heading + w.mountAngle;
                if (w.arc >= TAU - 1e-3) {
                    // Omnidirectional turret: faint range circle.
                    ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([3, 6]);
                    ctx.beginPath();
                    ctx.arc(sh.x, sh.y, w.range, 0, TAU);
                    ctx.stroke();
                    ctx.setLineDash([]);
                } else {
                    ctx.beginPath();
                    ctx.moveTo(sh.x, sh.y);
                    ctx.arc(sh.x, sh.y, w.range, mount - w.arc / 2, mount + w.arc / 2);
                    ctx.closePath();
                    ctx.fillStyle = 'rgba(99, 102, 241, 0.055)';
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(99, 102, 241, 0.16)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }
        };

        const drawMoveOrder = (sh: TacticalShip) => {
            const order = sh.moveOrder;
            if (!order) return;
            ctx.strokeStyle = 'rgba(52, 211, 153, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(sh.x, sh.y);
            ctx.lineTo(order.x, order.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(52, 211, 153, 0.8)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(order.x, order.y, 4, 0, TAU);
            ctx.stroke();
            if (order.face != null) {
                drawArrow(
                    order.x, order.y,
                    order.x + Math.cos(order.face) * 22,
                    order.y + Math.sin(order.face) * 22,
                    'rgba(52, 211, 153, 0.8)'
                );
            }
        };

        const drawShip = (st: BattleState, sh: TacticalShip, isSelected: boolean) => {
            const def = SHIP_CLASSES[sh.classId];
            const isPlayer = sh.side === 'player';
            const arriving = sh.status === 'arriving';
            const r = def.radius;

            ctx.save();
            ctx.translate(sh.x, sh.y);
            ctx.globalAlpha = arriving ? 0.35 : 1;

            // Rotated hull + engine glow.
            ctx.save();
            ctx.rotate(sh.heading);
            if (!arriving && sh.speed > 8) {
                const p = Math.min(1, sh.speed / def.maxSpeed);
                const glowR = r * (0.6 + p);
                const grad = ctx.createRadialGradient(-r * 1.05, 0, 0, -r * 1.05, 0, glowR);
                grad.addColorStop(0, isPlayer
                    ? `rgba(34, 211, 238, ${0.15 + 0.5 * p})`
                    : `rgba(251, 146, 60, ${0.15 + 0.5 * p})`);
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(-r * 1.05, 0, glowR, 0, TAU);
                ctx.fill();
            }
            ctx.beginPath();
            ctx.moveTo(r * 1.5, 0);
            ctx.lineTo(-r, -r * 0.85);
            ctx.lineTo(-r * 0.55, 0);
            ctx.lineTo(-r, r * 0.85);
            ctx.closePath();
            ctx.fillStyle = isPlayer ? 'rgba(99, 102, 241, 0.35)' : 'rgba(239, 68, 68, 0.3)';
            ctx.fill();
            ctx.strokeStyle = sh.status === 'retreating' ? '#fbbf24' : isPlayer ? '#818cf8' : '#f87171';
            ctx.lineWidth = 1.4;
            ctx.stroke();
            ctx.restore();

            // Shield ring: arc length proportional to shield fraction, centred on heading.
            if (!arriving && sh.shield > 0.5) {
                const frac = Math.min(1, sh.shield / def.maxShield);
                ctx.beginPath();
                ctx.arc(0, 0, r + 4.5, sh.heading - Math.PI * frac, sh.heading + Math.PI * frac);
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
                ctx.lineWidth = 1.4;
                ctx.stroke();
            }

            // Hull bar.
            const hf = Math.max(0, Math.min(1, sh.hull / def.maxHull));
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.fillRect(-r, r + 8, r * 2, 2.5);
            ctx.fillStyle = hf > 0.55 ? '#4ade80' : hf > 0.3 ? '#fbbf24' : '#f87171';
            ctx.fillRect(-r, r + 8, r * 2 * hf, 2.5);

            // Selection circle.
            if (isSelected) {
                ctx.setLineDash([4, 3]);
                ctx.strokeStyle = 'rgba(199, 210, 254, 0.9)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.arc(0, 0, r + 12, 0, TAU);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Warp-in countdown ring for arriving reinforcements.
            if (arriving) {
                ctx.globalAlpha = 1;
                const remaining = Math.max(0, sh.arrivalAt - st.time);
                const frac = Math.min(1, remaining / ARRIVAL_WARP_SECONDS);
                ctx.beginPath();
                ctx.arc(0, 0, r + 9, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.85)';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.font = '600 10px monospace';
                ctx.textAlign = 'center';
                ctx.fillStyle = 'rgba(203, 213, 225, 0.9)';
                ctx.fillText(`${Math.ceil(remaining)}`, 0, -r - 13);
            }
            ctx.restore();
        };

        const drawReticle = (t: TacticalShip) => {
            const c = SHIP_CLASSES[t.classId].radius + 10;
            const l = c * 0.45;
            ctx.save();
            ctx.translate(t.x, t.y);
            ctx.strokeStyle = '#f87171';
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(-c, -c + l); ctx.lineTo(-c, -c); ctx.lineTo(-c + l, -c);
            ctx.moveTo(c - l, -c); ctx.lineTo(c, -c); ctx.lineTo(c, -c + l);
            ctx.moveTo(c, c - l); ctx.lineTo(c, c); ctx.lineTo(c - l, c);
            ctx.moveTo(-c + l, c); ctx.lineTo(-c, c); ctx.lineTo(-c, c - l);
            ctx.stroke();
            ctx.restore();
        };

        const drawTorpedo = (st: BattleState, torp: Torpedo) => {
            const target = st.ships.find(s2 => s2.id === torp.targetId);
            let dx = 1;
            let dy = 0;
            if (target) {
                const dist = Math.hypot(target.x - torp.x, target.y - torp.y) || 1;
                dx = (target.x - torp.x) / dist;
                dy = (target.y - torp.y) / dist;
            }
            const rgb = torp.side === 'player' ? '165, 243, 252' : '253, 224, 71';
            ctx.strokeStyle = `rgba(${rgb}, 0.3)`;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(torp.x - dx * 16, torp.y - dy * 16);
            ctx.lineTo(torp.x, torp.y);
            ctx.stroke();
            ctx.fillStyle = `rgba(${rgb}, 0.25)`;
            ctx.beginPath();
            ctx.arc(torp.x, torp.y, 5, 0, TAU);
            ctx.fill();
            ctx.fillStyle = torp.side === 'player' ? '#cffafe' : '#fef9c3';
            ctx.beginPath();
            ctx.arc(torp.x, torp.y, 2.2, 0, TAU);
            ctx.fill();
        };

        const draw = (st: BattleState) => {
            const v = viewRef.current;
            const dpr = window.devicePixelRatio || 1;

            // Screen space: letterbox background.
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.fillStyle = '#020617';
            ctx.fillRect(0, 0, v.cw, v.ch);

            // World space.
            ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.ox, dpr * v.oy);

            // Battlefield backdrop.
            ctx.fillStyle = '#050b1e';
            ctx.fillRect(0, 0, st.width, st.height);

            // Starfield (static, seeded).
            for (const s of starsRef.current ?? []) {
                ctx.globalAlpha = s.a;
                ctx.fillStyle = '#cbd5e1';
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, TAU);
                ctx.fill();
            }
            ctx.globalAlpha = 1;

            // Grid.
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let gx = 100; gx < st.width; gx += 100) {
                ctx.moveTo(gx, 0);
                ctx.lineTo(gx, st.height);
            }
            for (let gy = 100; gy < st.height; gy += 100) {
                ctx.moveTo(0, gy);
                ctx.lineTo(st.width, gy);
            }
            ctx.stroke();

            // Edge strips: player retreat/entry on the LEFT, enemy on the RIGHT.
            ctx.fillStyle = 'rgba(99, 102, 241, 0.07)';
            ctx.fillRect(0, 0, st.edgeZone, st.height);
            ctx.fillStyle = 'rgba(239, 68, 68, 0.06)';
            ctx.fillRect(st.width - st.edgeZone, 0, st.edgeZone, st.height);
            ctx.setLineDash([6, 6]);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
            ctx.beginPath();
            ctx.moveTo(st.edgeZone, 0);
            ctx.lineTo(st.edgeZone, st.height);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.22)';
            ctx.beginPath();
            ctx.moveTo(st.width - st.edgeZone, 0);
            ctx.lineTo(st.width - st.edgeZone, st.height);
            ctx.stroke();
            ctx.setLineDash([]);

            // Own-zone label (rotated along the left strip).
            ctx.save();
            ctx.translate(st.edgeZone * 0.5, st.height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.font = '700 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(129, 140, 248, 0.35)';
            ctx.fillText('R E T R E A T   /   R E I N F O R C E M E N T   Z O N E', 0, 5);
            ctx.restore();

            // Field border.
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(0, 0, st.width, st.height);

            const selected = new Set(selectionRef.current);

            // Weapon arcs + move orders under the ships (selected own ships only).
            for (const sh of st.ships) {
                if (!selected.has(sh.id)) continue;
                if (sh.status !== 'active' && sh.status !== 'retreating') continue;
                drawWeaponArcs(sh);
                drawMoveOrder(sh);
            }

            // Ships.
            for (const sh of st.ships) {
                if (sh.status === 'destroyed' || sh.status === 'withdrawn') continue;
                drawShip(st, sh, selected.has(sh.id));
            }

            // Explicit-target reticles for the current selection.
            const targetIds = new Set<string>();
            for (const sh of st.ships) {
                if (selected.has(sh.id) && sh.targetId) targetIds.add(sh.targetId);
            }
            for (const id of targetIds) {
                const t = st.ships.find(s2 => s2.id === id);
                if (t && (t.status === 'active' || t.status === 'retreating')) drawReticle(t);
            }

            // Torpedoes.
            for (const torp of st.torpedoes) drawTorpedo(st, torp);

            // Beams (fading).
            for (const b of st.beams) {
                const a = Math.max(0, Math.min(1, (b.expiresAt - st.time) / BEAM_FADE_SECONDS));
                ctx.strokeStyle = b.side === 'player'
                    ? `rgba(129, 140, 248, ${0.9 * a})`
                    : `rgba(248, 113, 113, ${0.9 * a})`;
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(b.x1, b.y1);
                ctx.lineTo(b.x2, b.y2);
                ctx.stroke();
                ctx.strokeStyle = `rgba(241, 245, 249, ${0.5 * a})`;
                ctx.lineWidth = 0.6;
                ctx.beginPath();
                ctx.moveTo(b.x1, b.y1);
                ctx.lineTo(b.x2, b.y2);
                ctx.stroke();
            }

            // Explosions (expanding, fading).
            for (const ex of st.explosions) {
                const rem = Math.max(0, ex.expiresAt - st.time);
                const t01 = 1 - Math.min(1, rem / 0.7);
                const rr = ex.radius * (0.4 + 0.9 * t01);
                const a = Math.max(0, 1 - t01);
                const grad = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, rr);
                grad.addColorStop(0, `rgba(254, 240, 138, ${0.7 * a})`);
                grad.addColorStop(0.55, `rgba(251, 146, 60, ${0.45 * a})`);
                grad.addColorStop(1, 'rgba(251, 146, 60, 0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(ex.x, ex.y, rr, 0, TAU);
                ctx.fill();
                ctx.strokeStyle = `rgba(251, 146, 60, ${0.8 * a})`;
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.arc(ex.x, ex.y, rr, 0, TAU);
                ctx.stroke();
            }

            // Screen-space drag previews.
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const d = dragRef.current;
            if (d && d.moved && !st.outcome) {
                if (d.button === 0) {
                    const x = Math.min(d.startX, d.curX);
                    const y = Math.min(d.startY, d.curY);
                    const w = Math.abs(d.curX - d.startX);
                    const h = Math.abs(d.curY - d.startY);
                    ctx.fillStyle = 'rgba(99, 102, 241, 0.1)';
                    ctx.fillRect(x, y, w, h);
                    ctx.strokeStyle = 'rgba(129, 140, 248, 0.8)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 3]);
                    ctx.strokeRect(x, y, w, h);
                    ctx.setLineDash([]);
                } else if (selectionRef.current.length) {
                    // Move-with-facing preview: destination at press point, arrow = facing.
                    ctx.strokeStyle = 'rgba(52, 211, 153, 0.9)';
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.arc(d.startX, d.startY, 5, 0, TAU);
                    ctx.stroke();
                    drawArrow(d.startX, d.startY, d.curX, d.curY, 'rgba(52, 211, 153, 0.9)');
                }
            }
        };

        // ── Game loop ──
        let raf = 0;
        let last = performance.now();
        const loop = (now: number) => {
            const dt = Math.min(0.25, (now - last) / 1000);
            last = now;
            const st = stateRef.current;
            if (st) {
                if (speedRef.current > 0) update(st, dt * speedRef.current);
                draw(st);
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', fit);
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('contextmenu', onContextMenu);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [setSelection]);

    // ── HUD data (read straight off the mutable state; refreshed by the tick) ──
    const outcome = state.outcome;
    const result = outcome ? computeResult(state) : null;
    const usedPoints = activeDeploymentPoints(state, 'player');
    const enemyReserveShips = state.enemy.reserves.reduce((a, r) => a + r.count, 0);
    const events = state.events.slice(-4);
    const selectedShips = selectedIds
        .map(id => state.ships.find(sh => sh.id === id))
        .filter((sh): sh is TacticalShip =>
            !!sh && sh.status !== 'destroyed' && sh.status !== 'withdrawn');

    return (
        <div ref={wrapperRef} className="fixed inset-0 z-50 bg-slate-950 overflow-hidden select-none">
            <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />

            {/* ── Top bar ── */}
            <div className="absolute top-0 inset-x-0 flex items-center justify-between gap-4 px-4 py-2 bg-slate-950/85 backdrop-blur-md border-b border-indigo-700/30 pointer-events-none">
                <div className="flex items-baseline gap-3 min-w-0">
                    <span className="text-[11px] font-display font-bold tracking-widest text-indigo-300 uppercase truncate">
                        {title}
                    </span>
                    <span className="text-[9px] tracking-widest text-slate-500 uppercase truncate">
                        vs {enemyName}
                    </span>
                </div>
                <div className="flex items-center gap-3 pointer-events-auto">
                    <span className="text-[11px] font-mono text-slate-300 tabular-nums">{fmtTime(state.time)}</span>
                    <div className="flex items-center rounded border border-slate-700/70 overflow-hidden">
                        {[0, 1, 2].map(v => (
                            <button
                                key={v}
                                onClick={() => setSpeed(v)}
                                title={v === 0 ? 'Pause' : `${v}× speed`}
                                className={`px-2 py-1.5 transition-colors ${
                                    speed === v
                                        ? 'bg-indigo-600/40 text-indigo-200'
                                        : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                {v === 0 ? <Pause size={10} /> : v === 1 ? <Play size={10} /> : <FastForward size={10} />}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => {
                            if (state.player.withdrawing || outcome) return;
                            if (!confirmingWithdraw) {
                                setConfirmingWithdraw(true);
                                return;
                            }
                            setConfirmingWithdraw(false);
                            fleetWithdraw(state, 'player');
                            forceHud();
                        }}
                        disabled={state.player.withdrawing || !!outcome}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[9px] font-bold tracking-widest uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            confirmingWithdraw
                                ? 'bg-red-600/40 border-red-400/60 text-red-200 animate-pulse'
                                : 'bg-red-950/40 border-red-700/40 text-red-300 hover:bg-red-900/40'
                        }`}
                    >
                        <Flag size={10} />
                        {state.player.withdrawing ? 'Withdrawing…' : confirmingWithdraw ? 'Confirm?' : 'Withdraw All'}
                    </button>
                    {!outcome && (
                        <button
                            onClick={onAbort}
                            title="Close battle (abort before resolution)"
                            className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800/60"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Controls hint */}
            {!outcome && (
                <div className="absolute top-11 left-4 text-[8px] tracking-widest text-slate-600 uppercase pointer-events-none">
                    LMB select · drag box-select · LMB enemy = target · RMB move · RMB-drag move + facing · R retreat · ESC deselect
                </div>
            )}

            {/* ── Bottom-left: selected ships ── */}
            {selectedShips.length > 0 && !outcome && (
                <div className="absolute left-3 bottom-3 w-72 space-y-1 pointer-events-auto">
                    <div className="px-1 text-[9px] font-display font-bold tracking-widest text-indigo-300 uppercase">
                        Selected — {selectedShips.length} {selectedShips.length === 1 ? 'ship' : 'ships'}
                    </div>
                    {selectedShips.slice(0, MAX_SELECTED_ROWS).map(sh => {
                        const def = SHIP_CLASSES[sh.classId];
                        const abilityActive = sh.abilityActiveUntil > state.time;
                        const cooling = sh.abilityCooldown > 0;
                        const canUse = sh.status === 'active' && !cooling && !abilityActive;
                        return (
                            <div key={sh.id} className="rounded border border-indigo-700/30 bg-slate-950/85 backdrop-blur-sm px-2 py-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold tracking-widest text-slate-200 uppercase">
                                        {def.name}
                                    </span>
                                    <span className={`text-[8px] tracking-widest uppercase ${
                                        sh.status === 'retreating' ? 'text-amber-400' : 'text-slate-500'
                                    }`}>
                                        {sh.status}
                                    </span>
                                </div>
                                <div className="mt-1 space-y-0.5">
                                    <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-400"
                                            style={{ width: `${Math.round(Math.max(0, Math.min(1, sh.hull / def.maxHull)) * 100)}%` }}
                                        />
                                    </div>
                                    <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-sky-400"
                                            style={{ width: `${Math.round(Math.max(0, Math.min(1, sh.shield / def.maxShield)) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        triggerAbility(state, sh.id);
                                        forceHud();
                                    }}
                                    disabled={!canUse}
                                    className="mt-1.5 w-full flex items-center justify-between px-1.5 py-1 rounded bg-indigo-900/30 border border-indigo-600/30 text-[9px] font-bold tracking-wider text-indigo-200 hover:bg-indigo-800/40 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <span className="flex items-center gap-1">
                                        <Zap size={9} />
                                        {def.ability.name.toUpperCase()}
                                    </span>
                                    <span className="font-mono text-[8px]">
                                        {abilityActive ? 'ACTIVE' : cooling ? `${Math.ceil(sh.abilityCooldown)}s` : 'READY'}
                                    </span>
                                </button>
                            </div>
                        );
                    })}
                    {selectedShips.length > MAX_SELECTED_ROWS && (
                        <div className="px-1 text-[8px] text-slate-500 tracking-wider uppercase">
                            +{selectedShips.length - MAX_SELECTED_ROWS} more selected
                        </div>
                    )}
                </div>
            )}

            {/* ── Bottom-right: reinforcements ── */}
            {!outcome && (
                <div className="absolute right-3 bottom-3 w-64 rounded border border-indigo-700/30 bg-slate-950/85 backdrop-blur-sm p-2 space-y-1.5 pointer-events-auto">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] font-display font-bold tracking-widest text-indigo-300 uppercase">
                            Reinforcements
                        </span>
                        <span className="text-[9px] font-mono text-slate-400 tabular-nums">
                            {usedPoints}/{state.player.capacity} pts
                        </span>
                    </div>
                    {state.player.reserves.length === 0 ? (
                        <p className="text-[9px] text-slate-500">No reserves remaining.</p>
                    ) : (
                        state.player.reserves.map(entry => {
                            const def = SHIP_CLASSES[entry.classId];
                            const blocked =
                                state.player.withdrawing ||
                                usedPoints + def.deploymentCost > state.player.capacity;
                            return (
                                <button
                                    key={`${entry.classId}:${entry.sourceKey}`}
                                    onClick={() => {
                                        deployReinforcement(state, 'player', entry.classId, entry.sourceKey);
                                        forceHud();
                                    }}
                                    disabled={blocked}
                                    className="w-full flex items-center justify-between px-1.5 py-1 rounded bg-slate-900/60 border border-slate-700/60 text-[9px] font-bold tracking-wider text-slate-200 hover:bg-indigo-900/40 hover:border-indigo-600/40 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <span>{def.name.toUpperCase()} <span className="text-slate-500">({entry.sourceKey})</span> ×{entry.count}</span>
                                    <span className="font-mono text-slate-400">cost {def.deploymentCost}</span>
                                </button>
                            );
                        })
                    )}
                    <div className="pt-1 border-t border-slate-800/80 text-[8px] tracking-widest text-red-400/70 uppercase">
                        Enemy reserves: {enemyReserveShips} ships
                    </div>
                </div>
            )}

            {/* ── Bottom-center: battle log ── */}
            {!outcome && events.length > 0 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[26rem] max-w-[38vw] text-center space-y-0.5 pointer-events-none">
                    {events.map((ev, i) => (
                        <p
                            key={`${i}-${ev}`}
                            className={`text-[9px] font-mono leading-tight ${
                                i === events.length - 1 ? 'text-slate-300' : 'text-slate-500'
                            }`}
                        >
                            {ev}
                        </p>
                    ))}
                </div>
            )}

            {/* ── Outcome overlay ── */}
            {outcome && result && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm pointer-events-auto">
                    <div className="w-96 rounded-xl border border-indigo-700/40 bg-slate-950/95 shadow-2xl p-6 text-center space-y-4">
                        <div>
                            <div className={`text-2xl font-display font-bold tracking-widest uppercase ${
                                outcome.winner === 'player'
                                    ? 'text-emerald-300'
                                    : outcome.winner === 'enemy'
                                    ? 'text-red-400'
                                    : 'text-amber-300'
                            }`}>
                                {outcome.winner === 'player' ? 'Victory' : outcome.winner === 'enemy' ? 'Defeat' : 'Stalemate'}
                            </div>
                            <p className="mt-1 text-[10px] text-slate-400">{outcome.reason}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="rounded border border-indigo-700/30 bg-indigo-950/30 p-2">
                                <div className="text-[8px] tracking-widest text-indigo-300 uppercase">Your fleet</div>
                                <div className="text-lg font-mono text-slate-200 tabular-nums">
                                    {sumComposition(result.player.composition)}
                                </div>
                                <div className="text-[8px] tracking-wider text-slate-500 uppercase">ships surviving</div>
                            </div>
                            <div className="rounded border border-red-700/30 bg-red-950/20 p-2">
                                <div className="text-[8px] tracking-widest text-red-300 uppercase">{enemyName}</div>
                                <div className="text-lg font-mono text-slate-200 tabular-nums">
                                    {sumComposition(result.enemy.composition)}
                                </div>
                                <div className="text-[8px] tracking-wider text-slate-500 uppercase">ships surviving</div>
                            </div>
                        </div>
                        <div className="text-[9px] font-mono text-slate-500">
                            Engagement duration {fmtTime(result.durationSeconds)}
                        </div>
                        <button
                            onClick={() => onFinish(result)}
                            className="w-full py-2 rounded bg-indigo-600/40 hover:bg-indigo-500/50 border border-indigo-400/50 text-indigo-100 text-[11px] font-display font-bold tracking-widest uppercase transition-colors"
                        >
                            Return to Galaxy
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
