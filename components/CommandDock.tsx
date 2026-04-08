"use client";

import React from 'react';
import { Eye, TrendingUp, ScrollText, Radio, Users, Flame, Building2, Atom, Handshake, Cpu, UserCircle, Sword, Scale, BookOpen } from 'lucide-react';

interface CommandDockProps {
    onOpenEvent: () => void;
    onOpenGazette: () => void;
    onOpenFaction: () => void;
    onOpenIntrigue: () => void;
    onOpenTrade: () => void;
    onOpenColdWar: () => void;
    onOpenCorporate: () => void;
    onOpenBuild: () => void;
    onOpenResearch: () => void;
    onOpenDiplomacy: () => void;
    onOpenShipDesigner: () => void;
    onOpenLeadership: () => void;
    onOpenBattle: () => void;
    onOpenGovernment: () => void;
    onOpenDoctrine: () => void;
}

export default function CommandDock({ onOpenEvent, onOpenGazette, onOpenFaction, onOpenIntrigue, onOpenTrade, onOpenColdWar, onOpenCorporate, onOpenBuild, onOpenResearch, onOpenDiplomacy, onOpenShipDesigner, onOpenLeadership, onOpenBattle, onOpenGovernment, onOpenDoctrine }: CommandDockProps) {
    const DockButton = ({ label, icon, onClick, colorClass }: any) => {
        const colors: any = {
            blue: { border: 'group-hover:border-blue-500', bg: 'group-hover:bg-blue-600/20' },
            green: { border: 'group-hover:border-green-500', bg: 'group-hover:bg-green-600/20' },
            yellow: { border: 'group-hover:border-yellow-500', bg: 'group-hover:bg-yellow-600/20' },
            red: { border: 'group-hover:border-red-500', bg: 'group-hover:bg-red-600/20' },
            cyan: { border: 'group-hover:border-cyan-500', bg: 'group-hover:bg-cyan-600/20' },
            purple: { border: 'group-hover:border-purple-500', bg: 'group-hover:bg-purple-600/20' },
        };
        const c = colors[colorClass] || colors.blue;

        return (
            <button
                onClick={onClick}
                className={`
                    group relative flex items-center justify-end gap-3 px-4 py-3
                    transition-all duration-200 hover:-translate-x-2
                `}
            >
                <span className={`text-xs font-bold uppercase tracking-widest text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 px-2 py-1 rounded whitespace-nowrap`}>
                    {label}
                </span>
                <div className={`
                    w-14 h-14 rounded-full bg-slate-800 border-2 border-slate-600 
                    flex items-center justify-center text-slate-400 shadow-xl
                    ${c.border} group-hover:text-white ${c.bg}
                    transition-all duration-300
                `}>
                    {icon}
                </div>
            </button>
        );
    };

    return (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-2 pointer-events-auto items-end">

            {/* === Combat & Military === */}
            <DockButton
                label="Battle Command"
                colorClass="red"
                onClick={onOpenBattle}
                icon={<Sword size={24} />}
            />

            <DockButton
                label="Ship Designer"
                colorClass="blue"
                onClick={onOpenShipDesigner}
                icon={<Cpu size={24} />}
            />

            <div className="h-2" />

            {/* === Intelligence & Intrigue === */}
            <DockButton
                label="Intelligence"
                colorClass="red"
                onClick={onOpenIntrigue}
                icon={<Eye size={24} />}
            />

            <DockButton
                label="Cold War"
                colorClass="yellow"
                onClick={onOpenColdWar}
                icon={<Flame size={24} />}
            />

            <div className="h-2" />

            {/* === Economy & Development === */}
            <DockButton
                label="Construction"
                colorClass="cyan"
                onClick={onOpenBuild}
                icon={<Building2 size={24} />}
            />

            <DockButton
                label="Trade Network"
                colorClass="cyan"
                onClick={onOpenTrade}
                icon={<TrendingUp size={24} />}
            />

            <DockButton
                label="Galactic Exchange"
                colorClass="green"
                onClick={onOpenCorporate}
                icon={<Building2 size={24} />}
            />

            <DockButton
                label="Research"
                colorClass="blue"
                onClick={onOpenResearch}
                icon={<Atom size={24} />}
            />

            <div className="h-2" />

            {/* === Diplomacy & Politics === */}
            <DockButton
                label="Diplomacy"
                colorClass="blue"
                onClick={onOpenDiplomacy}
                icon={<Handshake size={24} />}
            />

            <DockButton
                label="Empire Doctrine"
                colorClass="purple"
                onClick={onOpenDoctrine}
                icon={<BookOpen size={24} />}
            />

            <DockButton
                label="Government"
                colorClass="yellow"
                onClick={onOpenGovernment}
                icon={<Scale size={24} />}
            />

            <DockButton
                label="Leadership"
                colorClass="yellow"
                onClick={onOpenLeadership}
                icon={<UserCircle size={24} />}
            />

            <div className="h-2" />

            {/* === News & Comms === */}
            <DockButton
                label="Faction Council"
                colorClass="yellow"
                onClick={onOpenFaction}
                icon={<Users size={24} />}
            />

            <DockButton
                label="Galactic Gazette"
                colorClass="green"
                onClick={onOpenGazette}
                icon={<ScrollText size={24} />}
            />

            <DockButton
                label="Sensor Log"
                colorClass="blue"
                onClick={onOpenEvent}
                icon={<Radio size={24} />}
            />

            {/* GO Button */}
            <div className="w-20 h-20 bg-amber-600 rounded-full border-4 border-amber-400 shadow-[0_0_20px_rgba(202,138,4,0.4)] flex items-center justify-center cursor-pointer hover:scale-105 transition-transform mt-4 mr-1">
                <span className="font-display font-bold text-2xl text-slate-900">GO</span>
            </div>

        </div>
    );
}
