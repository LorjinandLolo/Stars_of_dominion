import { getFaction, getFactionArmies, getPlanets } from '@/app/actions/state';
import { claimHomePlanetAction, recruitArmyAction } from '@/app/actions/factions';
import Link from 'next/link';

export default async function FactionDetail({ params }: { params: { id: string } }) {
    const faction: any = await getFaction(params.id);
    const armies = await getFactionArmies(params.id);
    const planets = await getPlanets(); // For claiming home planet demo

    // Parse JSON fields
    let resources: any = {};
    let traits = {};
    try {
        resources = typeof faction.resources === 'string' ? JSON.parse(faction.resources) : faction.resources;
        traits = typeof faction.traits === 'string' ? JSON.parse(faction.traits) : faction.traits;
    } catch (e) {
        console.error('Error parsing faction data', e);
    }

    // Bind actions with arguments
    const recruitAction = recruitArmyAction.bind(null, faction.$id, faction.home_planet_id);
    const claimAction = claimHomePlanetAction.bind(null, faction.$id);

    return (
        <main className="p-8 max-w-4xl mx-auto">
            <div className="mb-6">
                <Link href="/faction" className="text-neutral-400 hover:text-white text-sm">← Back to Faction Hub</Link>
            </div>

            <header className="mb-8 border-b border-neutral-800 pb-4">
                <h1 className="text-4xl font-bold mb-2">{faction.name}</h1>
                <div className="text-neutral-500 font-mono text-sm">ID: {faction.$id}</div>
            </header>

            <div className="grid md:grid-cols-2 gap-8">
                <section className="p-6 border border-neutral-800 rounded bg-neutral-900/30">
                    <h2 className="text-xl font-semibold mb-4">Resources</h2>
                    <div className="space-y-2">
                        {Object.entries(resources).map(([key, val]) => (
                            <div key={key} className="flex justify-between items-center border-b border-neutral-800/50 pb-1">
                                <span className="capitalize text-neutral-300">{key.replace('_', ' ')}</span>
                                <span className="font-mono font-bold text-blue-400">{String(val)}</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="p-6 border border-neutral-800 rounded bg-neutral-900/30">
                    <h2 className="text-xl font-semibold mb-4">Military Command</h2>
                    {armies.length === 0 ? (
                        <p className="text-neutral-500 italic mb-4">No active armies.</p>
                    ) : (
                        <ul className="space-y-2 mb-4">
                            {armies.map((army: any) => (
                                <li key={army.$id} className="bg-neutral-800/50 p-2 rounded text-sm">
                                    <div className="font-bold">Army {army.$id.substring(0, 6)}</div>
                                    <div className="text-neutral-400">Loc: {army.location_planet_id} | Status: {army.status}</div>
                                </li>
                            ))}
                        </ul>
                    )}

                    <form action={recruitAction}>
                        <button
                            disabled={!faction.home_planet_id || resources.economic < 50}
                            className="w-full bg-red-700 hover:bg-red-600 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold py-2 px-4 rounded transition-colors">
                            Recruit Army (50 Eco, 10 Mil)
                        </button>
                        {!faction.home_planet_id && <p className="text-xs text-red-400 mt-1 text-center">Must claim Home Planet first.</p>}
                    </form>
                </section>

                <section className="md:col-span-2 p-6 border border-neutral-800 rounded bg-neutral-900/30">
                    <h2 className="text-xl font-semibold mb-4">Home Planet</h2>
                    {faction.home_planet_id ? (
                        <div>
                            <div className="text-lg text-green-400 font-bold">Claimed Planet ID: {faction.home_planet_id}</div>
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <p className="text-neutral-400 mb-4">No home planet established.</p>
                            <form action={claimAction} className="flex gap-2 justify-center max-w-md mx-auto">
                                <select name="planetId" className="bg-black border border-neutral-700 rounded px-3 py-2 text-white">
                                    <option value="">Select a planet...</option>
                                    {planets.slice(0, 20).map((p: any) => (
                                        <option key={p.$id} value={p.$id}>{p.name} ({p.type})</option>
                                    ))}
                                </select>
                                <button className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded font-bold">
                                    Claim
                                </button>
                            </form>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
