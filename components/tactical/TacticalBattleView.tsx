"use client";

// components/tactical/TacticalBattleView.tsx
// Stars of Dominion — real-time tactical battle view (V2).
//
// Full-screen canvas renderer over the mutation-in-place sim in lib/tactical.
// The BattleState lives in a ref and is mutated by the rAF loop and player
// orders; React only re-renders the DOM HUD on a slow 250ms tick. The player
// enters/retreats on the LEFT edge, the enemy on the RIGHT.
//
// V2 layers on: directional shield arcs, hazard rendering (asteroid fields,
// nebulae), strike-craft squadrons with their own selection set + orders,
// subsystem call-shots, formation moves and fleet-command (admiral) abilities.

import React from 'react';
import type {
    BattleResult,
    BattleState,
    CommandAbilityId,
    FormationId,
    Hazard,
    BattleStationConfig,
    Squadron,
    SubsystemId,
    TacticalShip,
    Torpedo,
} from '@/lib/tactical/types';
import { SHIP_CLASSES, SQUADRON_DEFS } from '@/lib/tactical/ship-defs';
import {
    activeDeploymentPoints,
    computeResult,
    createBattle,
    deployReinforcement,
    fleetWithdraw,
    issueFormationMove,
    issueMove,
    orderRetreat,
    setSquadronOrder,
    setTarget,
    setTargetSubsystem,
    totalShield,
    update,
    useAbility as triggerAbility,
    useCommandAbility as triggerCommandAbility,
} from '@/lib/tactical/sim';
import {
    defaultEnemyPlan,
    fleetsStrength,
    fleetsToReserves,
    designTuningFor,
    type StrategicFleetLike,
} from '@/lib/tactical/fleet-adapter';
import { FastForward, Flag, Pause, Play, X, Zap } from 'lucide-react';
import type { BattleRenderer } from '@/lib/tactical/render3d/battle-renderer';
import { VIEW_TILT } from '@/lib/tactical/render3d/view';
import {
    fallbackHardpoints,
    projectHardpoint,
    radiusBox,
    type HardpointLayout,
} from '@/lib/tactical/render3d/hardpoints';

const TAU = Math.PI * 2;
const ARRIVAL_WARP_SECONDS = 4;   // mirrors ARRIVAL_DELAY in lib/tactical/sim.ts
const BEAM_FADE_SECONDS = 0.12;   // mirrors beam expiry in lib/tactical/sim.ts
const DRAG_THRESHOLD_PX = 5;
const MAX_SELECTED_ROWS = 6;
const SQUADRON_GRAB_RADIUS = 12;  // world units for squadron click-select

const FORMATIONS: FormationId[] = ['line', 'column', 'wedge', 'screen', 'circle'];
const SUBSYSTEM_IDS: SubsystemId[] = ['engines', 'shields', 'weapons', 'sensors'];
const FACING_LABELS = ['Fore', 'Starboard', 'Aft', 'Port'] as const;
const COMMAND_LABELS: Record<CommandAbilityId, string> = {
    coordinated_volley: 'Coordinated Volley',
    shield_pulse: 'Shield Pulse',
};

interface TacticalBattleViewProps {
    title?: string;
    playerFleets: StrategicFleetLike[];
    enemyFleets: StrategicFleetLike[];
    enemyName?: string;
    /** Battlefield hazards (asteroid fields, nebulae) forwarded to createBattle. */
    hazards?: Hazard[];
    /** The system's station or yard, drawn behind its owner's line (visual only). */
    station?: BattleStationConfig;
    /** Admirals unlock the side's fleet-command abilities. */
    playerHasAdmiral?: boolean;
    enemyHasAdmiral?: boolean;
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
    /** Ground-plane vertical squash from the tilted battle camera (render3d/view.ts). */
    tilt: number;
    /** Camera zoom, 1 = whole field in view. */
    zoom: number;
    /** Pixels per battle unit at zoom 1 (the fit-to-window scale). */
    baseScale: number;
}

/** Where the battle camera looks: a ground-plane point and a zoom. */
interface CameraState {
    cx: number;
    cy: number;
    zoom: number;
    /** False until the first fit has centred the camera on the player's fleet. */
    placed: boolean;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4.5;
const START_ZOOM = 2.3;
/** How far past the field edge the camera centre may wander, in battle units. */
const PAN_MARGIN = 120;
/** Keyboard and edge-scroll pan speed, in screen px per second. */
const PAN_SPEED_PX = 900;
/** Edge-scroll band at the canvas border, in px. */
const EDGE_SCROLL_PX = 14;
/** Hardpoint markers show on every enemy capital from this zoom; below it only on hovered or targeted ones. */
const HARDPOINT_ZOOM = 1.8;
/** Hardpoint marker radius, its click radius and the minimum spacing between one ship's markers, in screen px. */
const HARDPOINT_R = 7;
const HARDPOINT_HIT_PX = 9;
const HARDPOINT_SEP_PX = 17;

/** One hardpoint marker as laid out this frame, screen px. */
interface HardpointMarker {
    ship: TacticalShip;
    id: SubsystemId;
    /** Where the part is. */
    ax: number;
    ay: number;
    /** Where the marker is drawn: the part, nudged apart from its neighbours on a small or distant hull. */
    x: number;
    y: number;
}

interface DragState {
    /** 0 = left, 2 = right. */
    button: number;
    startX: number;
    startY: number;
    /** Press point on the ground plane. The camera can move mid-drag, so orders use this. */
    startWX: number;
    startWY: number;
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

/** FNV-1a — stable numeric seed from a squadron id. */
function hashStr(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
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
    hazards,
    station,
    playerHasAdmiral,
    enemyHasAdmiral,
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
            // The designer reaches the battle the player watches: shields,
            // armour, speed and the weapon mix come from the fleets' designs.
            playerTuning: designTuningFor(playerFleets),
            enemyTuning: designTuningFor(enemyFleets),
            enemyPlan: defaultEnemyPlan(),
            hazards,
            station,
            playerHasAdmiral,
            enemyHasAdmiral,
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

    // Static hazard dressing: rock speckle per asteroid field, seeded from the
    // hazard position so it never shimmers between frames.
    const hazardRocksRef = React.useRef<Array<Array<{ x: number; y: number; r: number }>> | null>(null);
    if (hazardRocksRef.current === null) {
        hazardRocksRef.current = state.hazards.map(h => {
            if (h.kind !== 'asteroid') return [];
            const rand = mulberry32((Math.round(h.x * 31 + h.y * 17 + h.r * 7) >>> 0) || 1);
            const count = Math.max(18, Math.min(60, Math.round((h.r * h.r) / 350)));
            return Array.from({ length: count }, () => {
                const rr = h.r * Math.sqrt(rand()) * 0.92;
                const a = rand() * TAU;
                return { x: h.x + Math.cos(a) * rr, y: h.y + Math.sin(a) * rr, r: 0.8 + rand() * 2.2 };
            });
        });
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

    // Squadron selection is a SEPARATE set — ship and squadron selections
    // never mix (selecting one clears the other).
    const [selectedSquadronIds, setSelectedSquadronIds] = React.useState<string[]>([]);
    const squadronSelectionRef = React.useRef<string[]>([]);
    const setSquadronSelection = React.useCallback((ids: string[]) => {
        squadronSelectionRef.current = ids;
        setSelectedSquadronIds(ids);
    }, []);

    // Armed formation: the NEXT right-click issues a formation move, then disarms.
    const [armedFormation, setArmedFormationState] = React.useState<FormationId | null>(null);
    const armedFormationRef = React.useRef<FormationId | null>(null);
    const setArmedFormation = React.useCallback((f: FormationId | null) => {
        armedFormationRef.current = f;
        setArmedFormationState(f);
    }, []);

    const setSelection = React.useCallback((ids: string[]) => {
        selectionRef.current = ids;
        setSelectedIds(ids);
        // Formations need ≥2 ships; disarm when the selection drops below that.
        if (ids.length < 2) {
            armedFormationRef.current = null;
            setArmedFormationState(null);
        }
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
                    // Mirror setSelection's rule: the formation bar needs ≥2
                    // ships, so a death-shrunk selection must also disarm —
                    // otherwise an invisible armed formation hijacks the next
                    // right-click into a formation move.
                    if (live.length < 2) setArmedFormation(null);
                }
                const liveSq = squadronSelectionRef.current.filter(id =>
                    st.squadrons.some(q => q.id === id && q.craft > 0));
                if (liveSq.length !== squadronSelectionRef.current.length) {
                    squadronSelectionRef.current = liveSq;
                    setSelectedSquadronIds(liveSq);
                }
            }
            forceHud();
        }, 250);
        return () => clearInterval(t);
    }, []);

    const wrapperRef = React.useRef<HTMLDivElement | null>(null);
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    // WebGL world layer under the 2D overlay (lib/tactical/render3d). Null
    // until three.js has loaded, or for good when WebGL is unavailable — the
    // 2D canvas then draws the world itself, exactly as it did before.
    const rendererRef = React.useRef<BattleRenderer | null>(null);
    const viewRef = React.useRef<ViewState>({ scale: 1, ox: 0, oy: 0, cw: 0, ch: 0, tilt: VIEW_TILT, zoom: 1, baseScale: 1 });
    const cameraRef = React.useRef<CameraState>({ cx: 0, cy: 0, zoom: START_ZOOM, placed: false });
    const dragRef = React.useRef<DragState | null>(null);

    // ── Canvas loop, camera and input ──
    React.useEffect(() => {
        const canvas = canvasRef.current;
        const wrapper = wrapperRef.current;
        if (!canvas || !wrapper) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        function screenToWorld(sx: number, sy: number) {
            const v = viewRef.current;
            return { x: (sx - v.ox) / v.scale, y: (sy - v.oy) / (v.scale * v.tilt) };
        }

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
            // Zoom 1 fits the whole field; the tilted camera squashes it
            // vertically, so fit on the foreshortened height.
            const tilt = VIEW_TILT;
            const baseScale = Math.min(cw / st.width, ch / (st.height * tilt)) || 1;
            viewRef.current = { ...viewRef.current, cw, ch, tilt, baseScale };
            const cam = cameraRef.current;
            if (!cam.placed) {
                // Open close in on the player's own fleet, Empire-at-War style.
                const c = fleetCentre(st, []);
                cam.cx = c.x + 120;
                cam.cy = c.y;
                cam.zoom = START_ZOOM;
                cam.placed = true;
            }
            applyCamera();
            rendererRef.current?.resize(viewRef.current);
        };

        /** Centre of the given ships, or of the player's fleet when none are given. */
        const fleetCentre = (st: BattleState, ids: string[]) => {
            const pick = ids.length
                ? st.ships.filter(sh => ids.includes(sh.id))
                : st.ships.filter(sh => sh.side === 'player' && sh.status !== 'destroyed' && sh.status !== 'withdrawn');
            if (!pick.length) return { x: st.edgeZone + 120, y: st.height / 2 };
            return {
                x: pick.reduce((a, sh) => a + sh.x, 0) / pick.length,
                y: pick.reduce((a, sh) => a + sh.y, 0) / pick.length,
            };
        };

        /** Clamp the camera to the field and derive the view the overlay, renderer and clicks share. */
        const applyCamera = () => {
            const st = stateRef.current;
            if (!st) return;
            const v = viewRef.current;
            const cam = cameraRef.current;
            cam.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom));
            const scale = v.baseScale * cam.zoom;
            const halfW = v.cw / (2 * scale);
            const halfH = v.ch / (2 * scale * v.tilt);
            // The margin past the field edge grows with zoom: none at zoom 1,
            // so the whole-field view is always centred.
            const margin = PAN_MARGIN * (1 - MIN_ZOOM / cam.zoom);
            const clampAxis = (c: number, half: number, size: number) => {
                const lo = half - margin;
                const hi = size - half + margin;
                return lo > hi ? size / 2 : Math.min(hi, Math.max(lo, c));
            };
            cam.cx = clampAxis(cam.cx, halfW, st.width);
            cam.cy = clampAxis(cam.cy, halfH, st.height);
            viewRef.current = {
                ...v,
                scale,
                zoom: cam.zoom,
                ox: v.cw / 2 - cam.cx * scale,
                oy: v.ch / 2 - cam.cy * scale * v.tilt,
            };
        };

        /** Zoom by a factor, keeping the ground point under (sx, sy) fixed on screen. */
        const zoomAt = (factor: number, sx: number, sy: number) => {
            const before = screenToWorld(sx, sy);
            const cam = cameraRef.current;
            cam.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * factor));
            const v = viewRef.current;
            const scale = v.baseScale * cam.zoom;
            cam.cx = before.x - (sx - v.cw / 2) / scale;
            cam.cy = before.y - (sy - v.ch / 2) / (scale * v.tilt);
            applyCamera();
        };

        /** Pan by a screen-space delta in px. */
        const panBy = (dxPx: number, dyPx: number) => {
            const v = viewRef.current;
            const cam = cameraRef.current;
            cam.cx += dxPx / v.scale;
            cam.cy += dyPx / (v.scale * v.tilt);
            applyCamera();
        };

        fit();
        window.addEventListener('resize', fit);

        // three.js stays out of the main bundle: load it only once a battle
        // opens, and fall back to the 2D world drawing if anything fails.
        // The GL canvas is created here, not by React: disposing a renderer
        // force-loses its context, and a canvas with a lost context can never
        // host a new one, so every run of this effect needs a fresh element.
        let glCancelled = false;
        const glCanvas = document.createElement('canvas');
        glCanvas.className = 'absolute inset-0 h-full w-full';
        wrapper.insertBefore(glCanvas, canvas);
        {
            import('@/lib/tactical/render3d/battle-renderer')
                .then(({ BattleRenderer }) => {
                    const st = stateRef.current;
                    if (glCancelled || !st) return;
                    try {
                        const r = new BattleRenderer(glCanvas, st, {
                            player: playerFleets[0]?.factionId,
                            enemy: enemyFleets[0]?.factionId,
                        });
                        r.resize(viewRef.current);
                        rendererRef.current = r;
                        if (process.env.NODE_ENV !== 'production') {
                            // Dev-only handle so a console probe can time frames.
                            // hardpointPass lays out and draws the marker overlay once, returning the marker count.
                            const hardpointPass = () => {
                                const s = stateRef.current;
                                if (!s) return 0;
                                collectMarkers(s);
                                drawHardpoints(s, new Set(selectionRef.current));
                                return markerCount;
                            };
                            (window as unknown as { __tactical?: unknown }).__tactical = { renderer: r, stateRef, viewRef, cameraRef, hardpointPass };
                        }
                    } catch (err) {
                        console.warn('[tactical] WebGL renderer unavailable, drawing the world in 2D', err);
                    }
                })
                .catch(err => console.warn('[tactical] 3D renderer failed to load, drawing the world in 2D', err));
        }

        const toLocal = (clientX: number, clientY: number) => {
            const rect = canvas.getBoundingClientRect();
            return { x: clientX - rect.left, y: clientY - rect.top };
        };
        const worldToScreen = (wx: number, wy: number) => {
            const v = viewRef.current;
            return { x: v.ox + wx * v.scale, y: v.oy + wy * v.scale * v.tilt };
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

        const squadronAt = (st: BattleState, wx: number, wy: number): Squadron | null => {
            let best: Squadron | null = null;
            let bestDist = Infinity;
            for (const sq of st.squadrons) {
                if (sq.side !== 'player' || sq.craft <= 0) continue;
                const d = Math.hypot(sq.x - wx, sq.y - wy);
                if (d <= SQUADRON_GRAB_RADIUS && d < bestDist) {
                    best = sq;
                    bestDist = d;
                }
            }
            return best;
        };

        // ── Hardpoint markers (Empire-at-War style subsystem targeting on the hull) ──
        // Laid out in screen px once per frame and again on a click, into a
        // reused pool: nothing allocates per frame once the pool has grown.
        const markers: HardpointMarker[] = [];
        let markerCount = 0;
        /** Enemy ship under the cursor; sticky while the cursor is on one of its markers. */
        let hoverShipId: string | null = null;
        let hoverMarker: HardpointMarker | null = null;
        const flatLayouts = new Map<string, HardpointLayout>();
        const layoutFor = (sh: TacticalShip): HardpointLayout => {
            const fromModel = rendererRef.current?.hardpoints(sh.classId, sh.side);
            if (fromModel) return fromModel;
            let flat = flatLayouts.get(sh.classId);
            if (!flat) {
                flat = fallbackHardpoints(radiusBox(SHIP_CLASSES[sh.classId].radius));
                flatLayouts.set(sh.classId, flat);
            }
            return flat;
        };

        /** Push one ship's markers apart until none sit closer than HARDPOINT_SEP_PX. */
        const spreadMarkers = (from: number, to: number) => {
            for (let pass = 0; pass < 4; pass++) {
                let moved = false;
                for (let i = from; i < to; i++) {
                    for (let j = i + 1; j < to; j++) {
                        const a = markers[i], b = markers[j];
                        let dx = b.x - a.x, dy = b.y - a.y;
                        let d = Math.hypot(dx, dy);
                        if (d >= HARDPOINT_SEP_PX) continue;
                        if (d < 0.01) {
                            // Coincident: split along a fixed per-pair direction.
                            const ang = (i * 4 + j) * 1.9;
                            dx = Math.cos(ang); dy = Math.sin(ang); d = 1;
                        }
                        const push = (HARDPOINT_SEP_PX - d) / 2 / d;
                        a.x -= dx * push; a.y -= dy * push;
                        b.x += dx * push; b.y += dy * push;
                        moved = true;
                    }
                }
                if (!moved) break;
            }
        };

        /**
         * Lay out the markers for this instant: enemy capitals only, only with
         * own ships selected, and then on every one in view once zoomed in, or
         * on the hovered ship and the selection's targets when zoomed out.
         */
        const collectMarkers = (st: BattleState) => {
            markerCount = 0;
            const sel = selectionRef.current;
            if (!sel.length || st.outcome) return;
            const v = viewRef.current;
            const zoomed = v.zoom >= HARDPOINT_ZOOM;
            let targets: Set<string> | null = null;
            if (!zoomed) {
                for (const sh of st.ships) {
                    if (sh.targetId && sel.includes(sh.id)) (targets ??= new Set()).add(sh.targetId);
                }
            }
            const pad = 60;
            for (const sh of st.ships) {
                if (sh.side !== 'enemy' || !sh.subsystems) continue;
                if (sh.status !== 'active' && sh.status !== 'retreating') continue;
                if (!zoomed && sh.id !== hoverShipId && !targets?.has(sh.id)) continue;
                const sx = v.ox + sh.x * v.scale;
                const sy = v.oy + sh.y * v.scale * v.tilt;
                if (sx < -pad || sx > v.cw + pad || sy < -pad || sy > v.ch + pad) continue;
                const layout = layoutFor(sh);
                const first = markerCount;
                for (const id of SUBSYSTEM_IDS) {
                    let m = markers[markerCount];
                    if (!m) {
                        m = { ship: sh, id, ax: 0, ay: 0, x: 0, y: 0 };
                        markers.push(m);
                    }
                    m.ship = sh;
                    m.id = id;
                    projectHardpoint(sh, layout[id], v, m);
                    m.ax = m.x;
                    m.ay = m.y;
                    markerCount++;
                }
                spreadMarkers(first, markerCount);
            }
        };

        /** The live (not knocked-out) marker under a screen point, if any. */
        const markerAt = (px: number, py: number): HardpointMarker | null => {
            let best: HardpointMarker | null = null;
            let bestD = HARDPOINT_HIT_PX;
            for (let i = 0; i < markerCount; i++) {
                const m = markers[i];
                if ((m.ship.subsystems?.[m.id] ?? 0) <= 0) continue;
                const d = Math.hypot(m.x - px, m.y - py);
                if (d <= bestD) {
                    best = m;
                    bestD = d;
                }
            }
            return best;
        };

        /** Per frame, before layout: which enemy ship and marker the cursor is on. */
        const updateHover = (st: BattleState) => {
            if (!pointer.inside || !selectionRef.current.length || st.outcome) {
                hoverShipId = null;
                return;
            }
            // Last frame's markers: the cursor resting on one keeps its ship
            // hovered even where the marker sits off the hull's grab radius.
            const onMarker = markerAt(pointer.x, pointer.y);
            if (onMarker) {
                hoverShipId = onMarker.ship.id;
                return;
            }
            const w = screenToWorld(pointer.x, pointer.y);
            hoverShipId = shipAt(st, w.x, w.y, sh =>
                sh.side === 'enemy' && !!sh.subsystems && (sh.status === 'active' || sh.status === 'retreating'))?.id ?? null;
        };

        // ── Camera input: middle-drag pan, wheel zoom, keys, edge scroll ──
        let panDrag: { x: number; y: number } | null = null;
        const pointer = { x: 0, y: 0, inside: false };
        const keysHeld = new Set<string>();

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const p = toLocal(e.clientX, e.clientY);
            zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
        };
        const onPointerMove = (e: MouseEvent) => {
            const p = toLocal(e.clientX, e.clientY);
            pointer.x = p.x;
            pointer.y = p.y;
            pointer.inside = true;
        };
        const onPointerLeave = () => { pointer.inside = false; };
        const onKeyUp = (e: KeyboardEvent) => { keysHeld.delete(e.key.toLowerCase()); };
        const onBlur = () => { keysHeld.clear(); pointer.inside = false; };

        /** Per-frame pan from held keys and the mouse resting at the canvas edge. */
        const stepCamera = (dt: number) => {
            let dx = 0;
            let dy = 0;
            if (keysHeld.has('a') || keysHeld.has('arrowleft')) dx -= 1;
            if (keysHeld.has('d') || keysHeld.has('arrowright')) dx += 1;
            if (keysHeld.has('w') || keysHeld.has('arrowup')) dy -= 1;
            if (keysHeld.has('s') || keysHeld.has('arrowdown')) dy += 1;
            const v = viewRef.current;
            if (pointer.inside && !dragRef.current && !panDrag && document.hasFocus()) {
                if (pointer.x < EDGE_SCROLL_PX) dx -= 1;
                if (pointer.x > v.cw - EDGE_SCROLL_PX) dx += 1;
                if (pointer.y < EDGE_SCROLL_PX) dy -= 1;
                if (pointer.y > v.ch - EDGE_SCROLL_PX) dy += 1;
            }
            if (dx || dy) {
                const len = Math.hypot(dx, dy);
                panBy((dx / len) * PAN_SPEED_PX * dt, (dy / len) * PAN_SPEED_PX * dt);
            } else {
                applyCamera();
            }
        };

        // ── Mouse ──
        const onMouseDown = (e: MouseEvent) => {
            if (e.button === 1) {
                // Middle button drags the camera, any time (also after the battle).
                panDrag = { x: e.clientX, y: e.clientY };
                e.preventDefault();
                return;
            }
            const st = stateRef.current;
            if (!st || st.outcome) return;
            if (e.button !== 0 && e.button !== 2) return;
            const p = toLocal(e.clientX, e.clientY);
            const w0 = screenToWorld(p.x, p.y);
            dragRef.current = {
                button: e.button,
                startX: p.x,
                startY: p.y,
                startWX: w0.x,
                startWY: w0.y,
                curX: p.x,
                curY: p.y,
                moved: false,
                shift: e.shiftKey,
            };
            e.preventDefault();
        };

        const onMouseMove = (e: MouseEvent) => {
            if (panDrag) {
                panBy(panDrag.x - e.clientX, panDrag.y - e.clientY);
                panDrag = { x: e.clientX, y: e.clientY };
                return;
            }
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
            if (e.button === 1) {
                panDrag = null;
                return;
            }
            const d = dragRef.current;
            if (!d || e.button !== d.button) return;
            dragRef.current = null;
            const st = stateRef.current;
            if (!st || st.outcome) return;
            const p = toLocal(e.clientX, e.clientY);
            const wp = screenToWorld(p.x, p.y);

            // Right button: ship move (or armed-formation move) — press point is
            // the destination, a drag sets the final facing along the drag
            // vector. With squadrons selected instead: patrol at that point.
            if (d.button === 2) {
                const dest = { x: d.startWX, y: d.startWY };
                const face = d.moved ? Math.atan2(wp.y - dest.y, wp.x - dest.x) : null;
                const sel = selectionRef.current;
                if (sel.length) {
                    const formation = armedFormationRef.current;
                    if (formation) {
                        issueFormationMove(st, sel, dest.x, dest.y, face, formation);
                        setArmedFormation(null);
                    } else {
                        issueMove(st, sel, dest.x, dest.y, face);
                    }
                    return;
                }
                if (squadronSelectionRef.current.length) {
                    setSquadronOrder(st, squadronSelectionRef.current, 'patrol', null, dest.x, dest.y);
                }
                return;
            }

            // Left drag: box-select own active ships.
            if (d.moved) {
                const a = { x: d.startWX, y: d.startWY };
                const x0 = Math.min(a.x, wp.x);
                const x1 = Math.max(a.x, wp.x);
                const y0 = Math.min(a.y, wp.y);
                const y1 = Math.max(a.y, wp.y);
                const inBox = st.ships
                    .filter(sh =>
                        sh.side === 'player' && sh.status === 'active' &&
                        sh.x >= x0 && sh.x <= x1 && sh.y >= y0 && sh.y <= y1)
                    .map(sh => sh.id);
                const next = d.shift ? [...new Set([...selectionRef.current, ...inBox])] : inBox;
                setSelection(next);
                if (next.length) setSquadronSelection([]);
                return;
            }

            // Left click on a hardpoint marker: target that ship AND call that
            // subsystem in one go. Wins over everything else, but only when the
            // cursor is actually on a marker; the hull around it keeps the
            // ordinary click below.
            if (selectionRef.current.length) {
                collectMarkers(st);
                const m = markerAt(p.x, p.y);
                if (m) {
                    const sel = selectionRef.current;
                    // Clicking the shot already called calls it off, like the HUD card.
                    const already = sel.every(id => {
                        const own = st.ships.find(sh => sh.id === id);
                        return !own || (own.targetId === m.ship.id && own.targetSubsystem === m.id);
                    });
                    setTarget(st, sel, m.ship.id);
                    setTargetSubsystem(st, sel, already ? null : m.id);
                    forceHud();
                    return;
                }
            }

            // Left click: own ship → select; own squadron → select squadron;
            // enemy ship → target (ships) / strike order (squadrons); empty → clear.
            const own = shipAt(st, wp.x, wp.y, sh => sh.side === 'player' && sh.status === 'active');
            if (own) {
                if (d.shift) {
                    const cur = selectionRef.current;
                    setSelection(cur.includes(own.id) ? cur.filter(id => id !== own.id) : [...cur, own.id]);
                } else {
                    setSelection([own.id]);
                }
                setSquadronSelection([]);
                return;
            }
            // With a selection in hand, ORDERING on an enemy ship outranks
            // selecting an own squadron — attack squadrons park on top of
            // their targets, and squadron-first made the target un-clickable
            // (every click grabbed the squadron and wiped the selection).
            const hostile = shipAt(st, wp.x, wp.y, sh =>
                sh.side === 'enemy' && (sh.status === 'active' || sh.status === 'retreating'));
            if (hostile) {
                if (squadronSelectionRef.current.length) {
                    setSquadronOrder(st, squadronSelectionRef.current, 'attack', hostile.id);
                    return;
                }
                if (selectionRef.current.length) {
                    setTarget(st, selectionRef.current, hostile.id);
                    forceHud();
                    return;
                }
            }
            const ownSq = squadronAt(st, wp.x, wp.y);
            if (ownSq) {
                if (d.shift) {
                    const cur = squadronSelectionRef.current;
                    setSquadronSelection(
                        cur.includes(ownSq.id) ? cur.filter(id => id !== ownSq.id) : [...cur, ownSq.id]);
                } else {
                    setSquadronSelection([ownSq.id]);
                }
                setSelection([]);
                return;
            }
            if (!d.shift) {
                setSelection([]);
                setSquadronSelection([]);
            }
        };

        const onContextMenu = (e: MouseEvent) => e.preventDefault();

        const onKeyDown = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if (['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
                keysHeld.add(key);
                if (key.startsWith('arrow')) e.preventDefault();
            }
            const v = viewRef.current;
            if (key === '=' || key === '+') zoomAt(1.25, v.cw / 2, v.ch / 2);
            else if (key === '-' || key === '_') zoomAt(0.8, v.cw / 2, v.ch / 2);
            else if (key === 'home') {
                const st0 = stateRef.current;
                cameraRef.current.zoom = MIN_ZOOM;
                if (st0) {
                    cameraRef.current.cx = st0.width / 2;
                    cameraRef.current.cy = st0.height / 2;
                }
                applyCamera();
            } else if (key === 'f') {
                // Focus: the selection if there is one, else the whole fleet.
                const st0 = stateRef.current;
                if (st0) {
                    const c = fleetCentre(st0, selectionRef.current);
                    cameraRef.current.cx = c.x;
                    cameraRef.current.cy = c.y;
                    cameraRef.current.zoom = Math.max(cameraRef.current.zoom, START_ZOOM);
                    applyCamera();
                }
            }
            const st = stateRef.current;
            if (!st || st.outcome) return;
            if (e.key === 'Escape') {
                setSelection([]);
                setSquadronSelection([]);
            } else if (e.key === 'r' || e.key === 'R') {
                if (selectionRef.current.length) orderRetreat(st, selectionRef.current);
            }
        };

        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('contextmenu', onContextMenu);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('mousemove', onPointerMove);
        canvas.addEventListener('mouseleave', onPointerLeave);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);

        // ── Drawing helpers (world space unless noted) ──

        /** Text at a ground point, with the tilt squash undone so letters keep their shape. */
        const groundText = (text: string, x: number, y: number) => {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(1, 1 / viewRef.current.tilt);
            ctx.fillText(text, 0, 0);
            ctx.restore();
        };

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

        // `hull` false = the WebGL layer draws the hull and engine glow; only
        // the overlay rings, bars and labels are painted here.
        const drawShip = (st: BattleState, sh: TacticalShip, isSelected: boolean, hull: boolean) => {
            const def = SHIP_CLASSES[sh.classId];
            const isPlayer = sh.side === 'player';
            const arriving = sh.status === 'arriving';
            const r = def.radius;

            ctx.save();
            ctx.translate(sh.x, sh.y);
            ctx.globalAlpha = arriving ? 0.35 : 1;

            // Rotated hull + engine glow.
            if (hull) {
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
            }

            // Directional shields: one quadrant arc per facing (F/S/A/P),
            // rotated with the heading. Opacity + thickness track that
            // facing's fraction of its maxShield/4 share.
            if (!arriving) {
                const facingCap = def.maxShield / 4;
                for (let i = 0; i < 4; i++) {
                    const val = sh.shields[i];
                    if (val <= 0.5) continue;
                    const frac = Math.min(1, val / facingCap);
                    const centre = sh.heading + (i * Math.PI) / 2;
                    ctx.beginPath();
                    ctx.arc(0, 0, r + 4.5, centre - Math.PI / 4 + 0.09, centre + Math.PI / 4 - 0.09);
                    ctx.strokeStyle = `rgba(56, 189, 248, ${0.22 + 0.55 * frac})`;
                    ctx.lineWidth = 0.8 + 1.3 * frac;
                    ctx.stroke();
                }
            }

            // Hull bar.
            const hf = Math.max(0, Math.min(1, sh.hull / def.maxHull));
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            // Hull bar: drawn on the squashed ground plane, so undo the squash
            // on its thickness or it turns into a hairline at low angles.
            const barH = 2.5 / viewRef.current.tilt;
            ctx.fillRect(-r, r + 8, r * 2, barH);
            ctx.fillStyle = hf > 0.55 ? '#4ade80' : hf > 0.3 ? '#fbbf24' : '#f87171';
            ctx.fillRect(-r, r + 8, r * 2 * hf, barH);

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
                ctx.save();
                ctx.translate(0, -r - 13);
                ctx.scale(1, 1 / viewRef.current.tilt);
                ctx.fillText(`${Math.ceil(remaining)}`, 0, 0);
                ctx.restore();
            }
            ctx.restore();
        };

        // Squadron: tight cluster of tiny triangles, one per surviving craft,
        // jittered deterministically from the squadron id + craft index.
        const drawSquadron = (sq: Squadron, isSelected: boolean, craft: boolean) => {
            const isPlayer = sq.side === 'player';
            const full = SQUADRON_DEFS[sq.type].craft;
            const rand = mulberry32(hashStr(sq.id));
            ctx.save();
            ctx.translate(sq.x, sq.y);
            ctx.fillStyle = isPlayer ? 'rgba(129, 140, 248, 0.55)' : 'rgba(248, 113, 113, 0.5)';
            for (let i = 0; craft && i < full; i++) {
                const jx = (rand() - 0.5) * 18;
                const jy = (rand() - 0.5) * 18;
                const ja = rand() * TAU;
                if (i >= sq.craft) continue; // dead slot — keep the jitter stream aligned
                ctx.save();
                ctx.translate(jx, jy);
                ctx.rotate(ja);
                ctx.beginPath();
                ctx.moveTo(2.6, 0);
                ctx.lineTo(-1.8, -1.7);
                ctx.lineTo(-1.8, 1.7);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
            if (isSelected) {
                ctx.setLineDash([3, 3]);
                ctx.strokeStyle = 'rgba(199, 210, 254, 0.8)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(0, 0, SQUADRON_GRAB_RADIUS + 1, 0, TAU);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.restore();
        };

        /** Append the subsystem's glyph, centred on (x, y), to the current path. */
        const hardpointGlyph = (id: SubsystemId, x: number, y: number) => {
            if (id === 'engines') {
                // Thrust chevrons pointing aft.
                ctx.moveTo(x + 1, y - 3); ctx.lineTo(x - 2, y); ctx.lineTo(x + 1, y + 3);
                ctx.moveTo(x + 4, y - 3); ctx.lineTo(x + 1, y); ctx.lineTo(x + 4, y + 3);
            } else if (id === 'shields') {
                // Dome over a base line.
                ctx.moveTo(x - 4, y + 2);
                ctx.arc(x, y + 2, 4, Math.PI, 0);
                ctx.moveTo(x - 4.5, y + 2.5); ctx.lineTo(x + 4.5, y + 2.5);
            } else if (id === 'weapons') {
                // Turret with a barrel.
                ctx.moveTo(x + 1.2, y + 1);
                ctx.arc(x - 1, y + 1, 2.2, 0, TAU);
                ctx.moveTo(x + 0.6, y - 0.6); ctx.lineTo(x + 4, y - 4);
            } else {
                // Sensor dish sweeping two arcs.
                ctx.moveTo(x - 2.5, y);
                ctx.arc(x - 2.5, y + 2.5, 2.5, -Math.PI / 2, 0);
                ctx.moveTo(x - 2.5, y - 2.5);
                ctx.arc(x - 2.5, y + 2.5, 5, -Math.PI / 2, 0);
                ctx.moveTo(x - 1.9, y + 2.5);
                ctx.arc(x - 2.5, y + 2.5, 0.6, 0, TAU);
            }
        };

        // Per-marker state for this frame's draw, so each style is one path.
        const HP_DEAD = 1, HP_HOT = 2, HP_CALLED = 4, HP_MOVED = 8, HP_HIGH = 16, HP_MID = 32;
        const markerFlags: number[] = [];
        const markerLevel: number[] = [];
        const calledShots: TacticalShip[] = [];

        /** Start a fresh path holding every marker whose (flags & mask) === value; false when there were none. */
        const markerPath = (mask: number, value: number, add: (m: HardpointMarker, i: number) => void): boolean => {
            let any = false;
            ctx.beginPath();
            for (let i = 0; i < markerCount; i++) {
                if ((markerFlags[i] & mask) !== value) continue;
                add(markers[i], i);
                any = true;
            }
            return any;
        };

        /**
         * Hardpoint markers over enemy hulls, screen space: leader line to the
         * part when the marker had to move off it, icon, integrity bar beside
         * it; knocked-out parts dim and are crossed out. Called shots of the
         * selection get the rose crosshair on their marker, ticks on the
         * diagonals so they stay clear of the bar. Batched by style, so a
         * crowded zoomed-in view costs a couple of dozen draw calls, not five
         * per marker.
         */
        const drawHardpoints = (st: BattleState, selected: Set<string>) => {
            if (!markerCount) return;
            // The selection's called shots: a handful at most, so a flat list.
            calledShots.length = 0;
            for (const sh of st.ships) {
                if (selected.has(sh.id) && sh.targetId && sh.targetSubsystem) calledShots.push(sh);
            }
            const isCalled = (m: HardpointMarker) => {
                for (const sh of calledShots) if (sh.targetId === m.ship.id && sh.targetSubsystem === m.id) return true;
                return false;
            };
            for (let i = 0; i < markerCount; i++) {
                const m = markers[i];
                const integrity = Math.max(0, Math.min(1, m.ship.subsystems?.[m.id] ?? 0));
                let f = integrity > 0.6 ? HP_HIGH : integrity > 0.3 ? HP_MID : 0;
                if (integrity <= 0) f |= HP_DEAD;
                if (hoverMarker === m) f |= HP_HOT;
                if (calledShots.length && isCalled(m)) f |= HP_CALLED;
                if (Math.abs(m.x - m.ax) + Math.abs(m.y - m.ay) > 2) f |= HP_MOVED;
                markerFlags[i] = f;
                markerLevel[i] = integrity;
            }
            const disc = (m: HardpointMarker, r: number) => {
                ctx.moveTo(m.x + r, m.y);
                ctx.arc(m.x, m.y, r, 0, TAU);
            };
            const glyph = (m: HardpointMarker) => hardpointGlyph(m.id, m.x, m.y);
            ctx.lineCap = 'round';

            // Leader lines from the part to a marker that had to move off it.
            if (markerPath(HP_MOVED, HP_MOVED, m => { ctx.moveTo(m.ax, m.ay); ctx.lineTo(m.x, m.y); })) {
                ctx.strokeStyle = 'rgba(252, 165, 165, 0.45)';
                ctx.lineWidth = 1;
                ctx.stroke();
                markerPath(HP_MOVED, HP_MOVED, m => ctx.rect(m.ax - 1, m.ay - 1, 2, 2));
                ctx.fillStyle = 'rgba(252, 165, 165, 0.7)';
                ctx.fill();
            }

            // Discs and rings: live, called, knocked out, hovered.
            const ringGroup = (mask: number, value: number, r: number, fill: string, ring: string, width: number) => {
                if (!markerPath(mask, value, m => disc(m, r))) return;
                ctx.fillStyle = fill;
                ctx.fill();
                ctx.strokeStyle = ring;
                ctx.lineWidth = width;
                ctx.stroke();
            };
            const STATE = HP_DEAD | HP_HOT | HP_CALLED;
            ringGroup(STATE, 0, HARDPOINT_R, 'rgba(15, 23, 42, 0.82)', 'rgba(248, 113, 113, 0.85)', 1.1);
            ringGroup(STATE, HP_CALLED, HARDPOINT_R, 'rgba(15, 23, 42, 0.82)', '#fb7185', 1.1);
            ringGroup(HP_DEAD | HP_HOT, HP_DEAD, HARDPOINT_R, 'rgba(15, 23, 42, 0.4)', 'rgba(100, 116, 139, 0.45)', 1.1);
            ringGroup(HP_HOT, HP_HOT, HARDPOINT_R + 1.5, 'rgba(69, 10, 10, 0.92)', '#fde68a', 1.6);

            // Glyphs.
            ctx.lineWidth = 1.1;
            if (markerPath(HP_DEAD | HP_HOT, 0, glyph)) { ctx.strokeStyle = '#fecaca'; ctx.stroke(); }
            if (markerPath(HP_DEAD | HP_HOT, HP_DEAD, glyph)) { ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)'; ctx.stroke(); }
            if (markerPath(HP_HOT, HP_HOT, glyph)) { ctx.strokeStyle = '#fef3c7'; ctx.stroke(); }

            // Called-shot crosshairs, under the bars.
            if (markerPath(HP_CALLED, HP_CALLED, m => {
                const r = HARDPOINT_R + 3;
                const k = Math.SQRT1_2;
                disc(m, r);
                for (let q = 0; q < 4; q++) {
                    const dx = q & 1 ? 1 : -1, dy = q & 2 ? 1 : -1;
                    ctx.moveTo(m.x + dx * k * (r - 2), m.y + dy * k * (r - 2));
                    ctx.lineTo(m.x + dx * k * (r + 5), m.y + dy * k * (r + 5));
                }
            })) {
                ctx.strokeStyle = '#fb7185';
                ctx.lineWidth = 1.3;
                ctx.stroke();
            }

            // Integrity bars to the right of the icons, coloured by what is left.
            const barX = HARDPOINT_R + 5, barW = 11;
            markerPath(0, 0, m => ctx.rect(m.x + barX - 0.5, m.y - 2, barW + 1, 4));
            ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
            ctx.fill();
            const barGroup = (value: number, colour: string) => {
                if (!markerPath(HP_HIGH | HP_MID | HP_DEAD, value, (m, i) => ctx.rect(m.x + barX, m.y - 1.5, barW * markerLevel[i], 3))) return;
                ctx.fillStyle = colour;
                ctx.fill();
            };
            barGroup(HP_HIGH, '#4ade80');
            barGroup(HP_MID, '#fbbf24');
            barGroup(0, '#f87171');

            // Knocked out: crossed through.
            if (markerPath(HP_DEAD, HP_DEAD, m => {
                const d = HARDPOINT_R - 1.5;
                ctx.moveTo(m.x - d, m.y - d); ctx.lineTo(m.x + d, m.y + d);
                ctx.moveTo(m.x + d, m.y - d); ctx.lineTo(m.x - d, m.y + d);
            })) {
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
                ctx.lineWidth = 1.4;
                ctx.stroke();
            }
            ctx.lineCap = 'butt';

            // Name and integrity over the hovered marker.
            const hot = hoverMarker;
            if (hot) {
                const r = HARDPOINT_R + 1.5;
                const integrity = Math.max(0, Math.min(1, hot.ship.subsystems?.[hot.id] ?? 0));
                const label = `${hot.id.toUpperCase()} ${Math.round(integrity * 100)}%`;
                ctx.font = '700 9px sans-serif';
                ctx.textAlign = 'center';
                const tw = ctx.measureText(label).width;
                ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
                ctx.fillRect(hot.x - tw / 2 - 3, hot.y - r - 15, tw + 6, 12);
                ctx.fillStyle = '#fde68a';
                ctx.fillText(label, hot.x, hot.y - r - 6);
            }
        };

        // Hazards render under the ships: rock speckle for asteroid fields,
        // soft purple/pink blobs for nebulae, tiny low-alpha caption at centre.
        const drawHazards = (st: BattleState, fills: boolean) => {
            const rocksPerHazard = hazardRocksRef.current ?? [];
            ctx.textAlign = 'center';
            st.hazards.forEach((h, i) => {
                if (!fills) {
                    // The WebGL layer owns the rocks and gas; keep the caption.
                    ctx.font = '600 9px sans-serif';
                    ctx.fillStyle = h.kind === 'asteroid' ? 'rgba(148, 163, 184, 0.28)' : 'rgba(216, 180, 254, 0.3)';
                    groundText(h.kind === 'asteroid' ? 'A S T E R O I D   F I E L D' : 'N E B U L A', h.x, h.y + 3);
                    return;
                }
                if (h.kind === 'asteroid') {
                    ctx.fillStyle = 'rgba(30, 41, 59, 0.55)';
                    ctx.beginPath();
                    ctx.arc(h.x, h.y, h.r, 0, TAU);
                    ctx.fill();
                    ctx.setLineDash([4, 6]);
                    ctx.strokeStyle = 'rgba(100, 116, 139, 0.25)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(h.x, h.y, h.r, 0, TAU);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
                    for (const rock of rocksPerHazard[i] ?? []) {
                        ctx.beginPath();
                        ctx.arc(rock.x, rock.y, rock.r, 0, TAU);
                        ctx.fill();
                    }
                    ctx.font = '600 9px sans-serif';
                    ctx.fillStyle = 'rgba(148, 163, 184, 0.28)';
                    groundText('A S T E R O I D   F I E L D', h.x, h.y + 3);
                } else {
                    const g1 = ctx.createRadialGradient(
                        h.x - h.r * 0.22, h.y - h.r * 0.12, 0,
                        h.x - h.r * 0.22, h.y - h.r * 0.12, h.r * 0.9);
                    g1.addColorStop(0, 'rgba(168, 85, 247, 0.2)');
                    g1.addColorStop(1, 'rgba(168, 85, 247, 0)');
                    ctx.fillStyle = g1;
                    ctx.beginPath();
                    ctx.arc(h.x - h.r * 0.22, h.y - h.r * 0.12, h.r * 0.9, 0, TAU);
                    ctx.fill();
                    const g2 = ctx.createRadialGradient(
                        h.x + h.r * 0.2, h.y + h.r * 0.14, 0,
                        h.x + h.r * 0.2, h.y + h.r * 0.14, h.r * 0.85);
                    g2.addColorStop(0, 'rgba(236, 72, 153, 0.16)');
                    g2.addColorStop(1, 'rgba(236, 72, 153, 0)');
                    ctx.fillStyle = g2;
                    ctx.beginPath();
                    ctx.arc(h.x + h.r * 0.2, h.y + h.r * 0.14, h.r * 0.85, 0, TAU);
                    ctx.fill();
                    ctx.setLineDash([4, 8]);
                    ctx.strokeStyle = 'rgba(216, 180, 254, 0.14)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(h.x, h.y, h.r, 0, TAU);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.font = '600 9px sans-serif';
                    ctx.fillStyle = 'rgba(216, 180, 254, 0.3)';
                    groundText('N E B U L A', h.x, h.y + 3);
                }
            });
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

            // With the WebGL layer up, it paints the world (backdrop, stars,
            // hazards, hulls, craft, torpedoes, beams, explosions) and this
            // canvas is a transparent overlay. Without it, draw everything.
            const r3d = rendererRef.current;
            if (r3d) r3d.render(st, v);

            // Screen space: letterbox background.
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            if (r3d) {
                ctx.clearRect(0, 0, v.cw, v.ch);
            } else {
                ctx.fillStyle = '#020617';
                ctx.fillRect(0, 0, v.cw, v.ch);
            }

            // World space.
            // World space on the tilted ground plane (affine, see render3d/view.ts).
            ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale * v.tilt, dpr * v.ox, dpr * v.oy);

            if (!r3d) {
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
            }

            // Grid: faint, it is a range aid, not the backdrop.
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.035)';
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
            ctx.scale(1, 1 / v.tilt);
            ctx.rotate(-Math.PI / 2);
            ctx.font = '700 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(129, 140, 248, 0.22)';
            ctx.fillText('R E T R E A T   /   R E I N F O R C E M E N T   Z O N E', 0, 5);
            ctx.restore();

            // Field border.
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(0, 0, st.width, st.height);

            // Hazards sit under everything that flies.
            drawHazards(st, !r3d);

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
                drawShip(st, sh, selected.has(sh.id), !r3d);
            }

            // Squadrons: dim strike-craft clusters over the ships.
            const selectedSq = new Set(squadronSelectionRef.current);
            for (const sq of st.squadrons) {
                if (sq.craft <= 0) continue;
                drawSquadron(sq, selectedSq.has(sq.id), !r3d);
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
            if (!r3d) for (const torp of st.torpedoes) drawTorpedo(st, torp);

            // Beams (fading).
            if (!r3d) for (const b of st.beams) {
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
            if (!r3d) for (const ex of st.explosions) {
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

            // Screen space from here on.
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // Hardpoint markers and called-shot crosshairs over the hulls.
            updateHover(st);
            collectMarkers(st);
            const nextHover = pointer.inside && !dragRef.current ? markerAt(pointer.x, pointer.y) : null;
            if ((nextHover !== null) !== (hoverMarker !== null)) {
                canvas.style.cursor = nextHover ? 'pointer' : '';
            }
            hoverMarker = nextHover;
            drawHardpoints(st, selected);

            // Drag previews.
            const d = dragRef.current;
            if (d && d.moved && !st.outcome) {
                const s0 = worldToScreen(d.startWX, d.startWY);
                if (d.button === 0) {
                    const x = Math.min(s0.x, d.curX);
                    const y = Math.min(s0.y, d.curY);
                    const w = Math.abs(d.curX - s0.x);
                    const h = Math.abs(d.curY - s0.y);
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
                    ctx.arc(s0.x, s0.y, 5, 0, TAU);
                    ctx.stroke();
                    drawArrow(s0.x, s0.y, d.curX, d.curY, 'rgba(52, 211, 153, 0.9)');
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
                stepCamera(dt);
                draw(st);
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(raf);
            glCancelled = true;
            rendererRef.current?.dispose();
            rendererRef.current = null;
            glCanvas.remove();
            window.removeEventListener('resize', fit);
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('contextmenu', onContextMenu);
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('mousemove', onPointerMove);
            canvas.removeEventListener('mouseleave', onPointerLeave);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
        };
    }, [setSelection, setSquadronSelection, setArmedFormation]);

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
    const selectedSquadrons = selectedSquadronIds
        .map(id => state.squadrons.find(q => q.id === id))
        .filter((q): q is Squadron => !!q && q.craft > 0);

    // Subsystem targeting card: shown when the WHOLE ship selection shares one
    // explicit enemy target and that target is a capital hull with subsystems.
    const calledTarget = (() => {
        if (!selectedShips.length) return null;
        const tid = selectedShips[0].targetId;
        if (!tid || !selectedShips.every(sh => sh.targetId === tid)) return null;
        const t = state.ships.find(sh => sh.id === tid);
        if (!t || t.side !== 'enemy' || !t.subsystems) return null;
        if (t.status !== 'active' && t.status !== 'retreating') return null;
        return { ship: t, subsystems: t.subsystems, active: selectedShips[0].targetSubsystem };
    })();

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
                    {state.player.commandAbilities.length > 0 && (
                        <div className="flex items-center gap-1.5 mr-1">
                            <span className="text-[8px] font-bold tracking-widest text-amber-300/70 uppercase">
                                Admiral on deck
                            </span>
                            {state.player.commandAbilities.map(a => {
                                const cooling = a.cooldownRemaining > 0;
                                return (
                                    <button
                                        key={a.id}
                                        onClick={() => {
                                            triggerCommandAbility(state, 'player', a.id);
                                            forceHud();
                                        }}
                                        disabled={cooling || !!outcome}
                                        className="flex items-center gap-1 px-2 py-1 rounded border border-amber-600/40 bg-amber-950/30 text-[8px] font-bold tracking-widest text-amber-200 uppercase hover:bg-amber-900/40 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {COMMAND_LABELS[a.id]}
                                        {cooling && (
                                            <span className="font-mono text-amber-400/80 tabular-nums">
                                                {Math.ceil(a.cooldownRemaining)}s
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
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
                    LMB select ship/squadron · drag box-select · LMB enemy = target / squadron strike · LMB hardpoint icon = target that subsystem · RMB move or patrol · RMB-drag + facing · formation: arm, then RMB · R retreat · ESC deselect · wheel zoom · MMB-drag / WASD / screen edge pan · F focus · Home zoom out
                </div>
            )}

            {/* ── Top-right: subsystem targeting card ── */}
            {calledTarget && !outcome && (
                <div className="absolute top-11 right-3 w-60 rounded border border-rose-700/40 bg-slate-950/85 backdrop-blur-sm p-2 space-y-1.5 pointer-events-auto">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] font-display font-bold tracking-widest text-rose-300 uppercase">
                            Target — {SHIP_CLASSES[calledTarget.ship.classId].name}
                        </span>
                        <button
                            onClick={() => {
                                setTargetSubsystem(state, selectedIds, null);
                                forceHud();
                            }}
                            disabled={!calledTarget.active}
                            className="text-[8px] font-bold tracking-widest text-slate-500 uppercase hover:text-rose-300 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Call off
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                        {SUBSYSTEM_IDS.map(id => {
                            const integrity = calledTarget.subsystems[id];
                            const active = calledTarget.active === id;
                            const dead = integrity <= 0;
                            return (
                                <button
                                    key={id}
                                    onClick={() => {
                                        setTargetSubsystem(state, selectedIds, active ? null : id);
                                        forceHud();
                                    }}
                                    disabled={dead}
                                    className={`rounded border px-1.5 py-1 text-left transition-colors ${
                                        active
                                            ? 'bg-rose-900/40 border-rose-500/60'
                                            : 'bg-slate-900/60 border-slate-700/60 hover:border-rose-700/50'
                                    } ${dead ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <span className={`text-[8px] font-bold tracking-widest uppercase ${
                                        dead ? 'line-through text-slate-500' : active ? 'text-rose-200' : 'text-slate-300'
                                    }`}>
                                        {id}
                                    </span>
                                    <div className="mt-0.5 h-0.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${active ? 'bg-rose-400' : 'bg-slate-400'}`}
                                            style={{ width: `${Math.round(Math.max(0, Math.min(1, integrity)) * 100)}%` }}
                                        />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Bottom-left: selected ships ── */}
            {selectedShips.length > 0 && !outcome && (
                <div className="absolute left-3 bottom-3 w-72 space-y-1 pointer-events-auto">
                    {selectedShips.length >= 2 && (
                        <div className="flex gap-1 px-1 pb-0.5">
                            {FORMATIONS.map(f => (
                                <button
                                    key={f}
                                    onClick={() => setArmedFormation(armedFormation === f ? null : f)}
                                    title={`Arm ${f} formation — next right-click issues the formation move`}
                                    className={`flex-1 py-1 rounded border text-[8px] font-bold tracking-widest uppercase transition-colors ${
                                        armedFormation === f
                                            ? 'bg-emerald-600/40 border-emerald-400/60 text-emerald-200'
                                            : 'bg-slate-950/85 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-indigo-600/40'
                                    }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="px-1 text-[9px] font-display font-bold tracking-widest text-indigo-300 uppercase">
                        Selected — {selectedShips.length} {selectedShips.length === 1 ? 'ship' : 'ships'}
                    </div>
                    {selectedShips.slice(0, MAX_SELECTED_ROWS).map(sh => {
                        const def = SHIP_CLASSES[sh.classId];
                        const abilityActive = sh.abilityActiveUntil > state.time;
                        const cooling = sh.abilityCooldown > 0;
                        const canUse = sh.status === 'active' && !cooling && !abilityActive;
                        return (
                            <div
                                key={sh.id}
                                title={`Hull ${Math.round(sh.hull)}/${def.maxHull} · Shields ${Math.round(totalShield(sh))}/${def.maxShield}`}
                                className="rounded border border-indigo-700/30 bg-slate-950/85 backdrop-blur-sm px-2 py-1.5"
                            >
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
                                    {/* Directional shields: F / S / A / P segments. */}
                                    <div className="flex gap-0.5">
                                        {FACING_LABELS.map((label, i) => (
                                            <div
                                                key={label}
                                                title={`${label} shield ${Math.round(sh.shields[i])}/${Math.round(def.maxShield / 4)}`}
                                                className="h-1 flex-1 bg-slate-800 rounded-full overflow-hidden"
                                            >
                                                <div
                                                    className="h-full bg-sky-400"
                                                    style={{ width: `${Math.round(Math.max(0, Math.min(1, sh.shields[i] / (def.maxShield / 4))) * 100)}%` }}
                                                />
                                            </div>
                                        ))}
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

            {/* ── Bottom-left: selected squadrons (mutually exclusive with ships) ── */}
            {selectedSquadrons.length > 0 && !outcome && (
                <div className="absolute left-3 bottom-3 w-72 space-y-1 pointer-events-auto">
                    <div className="px-1 text-[9px] font-display font-bold tracking-widest text-indigo-300 uppercase">
                        Squadrons — {selectedSquadrons.length} selected
                    </div>
                    {selectedSquadrons.map(sq => {
                        const sdef = SQUADRON_DEFS[sq.type];
                        return (
                            <div key={sq.id} className="rounded border border-indigo-700/30 bg-slate-950/85 backdrop-blur-sm px-2 py-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold tracking-widest text-slate-200 uppercase">
                                        {sq.type}
                                    </span>
                                    <span className="text-[9px] font-mono text-slate-400 tabular-nums">
                                        {sq.craft}/{sdef.craft} craft
                                    </span>
                                </div>
                                <div className="mt-0.5 text-[8px] tracking-widest text-slate-500 uppercase">
                                    Order: {sq.order}
                                </div>
                                <div className="mt-1 flex gap-1">
                                    <button
                                        onClick={() => {
                                            setSquadronOrder(state, [sq.id], 'defend', sq.carrierId);
                                            forceHud();
                                        }}
                                        className="flex-1 py-1 rounded bg-indigo-900/30 border border-indigo-600/30 text-[8px] font-bold tracking-widest text-indigo-200 uppercase hover:bg-indigo-800/40 transition-colors"
                                    >
                                        Defend
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSquadronOrder(state, [sq.id], 'return');
                                            forceHud();
                                        }}
                                        className="flex-1 py-1 rounded bg-slate-900/60 border border-slate-700/60 text-[8px] font-bold tracking-widest text-slate-300 uppercase hover:bg-slate-800/60 transition-colors"
                                    >
                                        Return
                                    </button>
                                </div>
                            </div>
                        );
                    })}
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
