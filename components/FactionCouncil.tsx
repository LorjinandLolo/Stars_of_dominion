'use client';

import { useState, useEffect } from 'react';
import { getUserProfile, getFactionMembers, joinFaction, updateMemberRole, generateInviteCode } from '@/app/actions/faction';
import { FactionRole } from '@/types';

// Example ideology derived from backend state
const mockIdeology = {
    order_chaos: 40,
    centralization_autonomy: 70,
    militarism_pacifism: 55,
    tradition_progress: -10,
    collectivism_individualism: 30,
    expansionism_isolationism: 60,
    authoritarianism_liberty: 80
};

export default function FactionCouncil() {
    const [userId, setUserId] = useState<string>('');
    const [profile, setProfile] = useState<any>(null);
    const [members, setMembers] = useState<any[]>([]);
    const [inviteCode, setInviteCode] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Simulating Auth for Demo
    useEffect(() => {
        const stored = localStorage.getItem('sod_user_id');
        if (stored) {
            setUserId(stored);
            loadProfile(stored);
        }
    }, []);

    const login = (id: string) => {
        localStorage.setItem('sod_user_id', id);
        setUserId(id);
        loadProfile(id);
    };

    const loadProfile = async (id: string) => {
        setLoading(true);
        try {
            const p: any = await getUserProfile(id);
            setProfile(p);
            if (p) {
                const m = await getFactionMembers(p.factionId);
                setMembers(m);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async (code: string) => {
        setLoading(true);
        try {
            await joinFaction(userId, code);
            await loadProfile(userId);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleInviteGen = async () => {
        if (!profile) return;
        const code = await generateInviteCode(profile.factionId);
        setInviteCode(code);
    };

    const handleRoleChange = async (memberId: string, role: FactionRole) => {
        await updateMemberRole(memberId, role);
        // Refresh
        if (profile) {
            const m = await getFactionMembers(profile.factionId);
            setMembers(m);
        }
    };

    if (!userId) {
        return (
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-lg">
                <h2 className="text-xl font-bold mb-4">Identity Verification</h2>
                <input
                    className="bg-black border border-neutral-700 p-2 rounded w-full mb-2"
                    placeholder="Enter User ID (e.g. user_1)"
                    onKeyDown={(e) => e.key === 'Enter' && login(e.currentTarget.value)}
                />
                <p className="text-xs text-neutral-500">Press Enter to simulate login</p>
            </div>
        );
    }

    if (loading) return <div className="p-6 animate-pulse bg-neutral-900 rounded-lg h-64"></div>;

    if (!profile) {
        return (
            <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-lg space-y-6">
                <h2 className="text-xl font-bold text-white">Faction Status: Stateless</h2>

                <div>
                    <h3 className="font-bold text-yellow-400 mb-2">Faction Database</h3>
                    <a
                        href="/faction_dossier.pdf"
                        target="_blank"
                        className="block w-full text-center bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-2 rounded border border-neutral-700 transition-colors"
                    >
                        View Faction Dossiers (PDF)
                    </a>
                </div>

                <div className="border-t border-neutral-800 pt-4">
                    <h3 className="font-bold text-green-400 mb-2">Join Existing Faction</h3>
                    <form action={(formData) => handleJoin(formData.get('code') as string)} className="flex gap-2">
                        <input name="code" className="bg-black border border-neutral-700 p-2 rounded flex-1" placeholder="Invite Code" required />
                        <button className="bg-green-600 px-4 py-2 rounded font-bold hover:bg-green-500">Join</button>
                    </form>
                </div>
                {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>
        );
    }

    const isLeader = profile.role === 'Leader';

    return (
        <div className="bg-neutral-900/40 border border-neutral-800 rounded-lg p-5 backdrop-blur-md">
            <div className="flex justify-between items-start mb-6 border-b border-neutral-800 pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">High Council</h2>
                    <p className="text-neutral-400 text-sm">Governing Body of your Faction</p>
                </div>
                {isLeader && (
                    <div className="text-right">
                        <button onClick={handleInviteGen} className="text-xs bg-neutral-800 hover:bg-neutral-700 px-3 py-1 rounded border border-neutral-700 transition-colors">
                            Generate Invite
                        </button>
                        {inviteCode && <p className="text-xs font-mono text-green-400 mt-1 select-all">{inviteCode}</p>}
                    </div>
                )}
            </div>

            <div className="space-y-3">
                {members.map((m) => (
                    <div key={m.$id} className="flex items-center justify-between bg-black/40 p-3 rounded border border-neutral-800/50">
                        <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${m.role === 'Leader' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                {m.userId.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <p className="text-sm font-medium text-neutral-200">{m.userId}</p>
                                <p className="text-xs text-neutral-500">{m.role}</p>
                            </div>
                        </div>

                        {isLeader && m.userId !== userId ? (
                            <select
                                className="bg-neutral-900 border border-neutral-700 text-xs rounded p-1 text-neutral-300 focus:border-blue-500 outline-none"
                                value={m.role}
                                onChange={(e) => handleRoleChange(m.$id, e.target.value as FactionRole)}
                            >
                                <option value="Minister of Defense">Minister of Defense</option>
                                <option value="Economic Advisor">Economic Advisor</option>
                                <option value="Head of Intelligence">Head of Intelligence</option>
                                <option value="Citizen">Citizen</option>
                            </select>
                        ) : (
                            <span className="text-xs text-neutral-600 px-2 py-1 bg-neutral-900 rounded border border-neutral-800">
                                {m.role}
                            </span>
                        )}
                    </div>
                ))}
            </div>
            <div className="mt-8 pt-6 border-t border-neutral-800">
                <div className="mb-4">
                    <h3 className="text-lg font-bold text-white">State Ideology Drift</h3>
                    <p className="text-xs text-neutral-400">Current philosophical alignment across all systems. Influenced by major events and bloc satisfaction.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(mockIdeology).map(([axis, val]) => {
                        const [left, right] = axis.split('_');
                        const percentage = ((val + 100) / 200) * 100; // Map -100 to 100 -> 0% to 100%

                        return (
                            <div key={axis} className="bg-black/50 p-3 rounded border border-neutral-800/50">
                                <div className="flex justify-between text-xs font-bold text-neutral-400 uppercase mb-2">
                                    <span className={val < -20 ? "text-blue-400" : ""}>{left}</span>
                                    <span className={val > 20 ? "text-red-400" : ""}>{right}</span>
                                </div>
                                <div className="relative h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
                                    <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-neutral-600 z-10"></div>
                                    <div
                                        className={`absolute top-0 bottom-0 ${val < 0 ? 'bg-blue-500 rounded-l-full' : 'bg-red-500 rounded-r-full'}`}
                                        style={{
                                            left: val < 0 ? `${percentage}%` : '50%',
                                            right: val < 0 ? '50%' : `${100 - percentage}%`
                                        }}
                                    ></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
