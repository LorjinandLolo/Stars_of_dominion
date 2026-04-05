import { getFactions } from '@/app/actions/state';
import CreateFactionForm from '@/components/CreateFactionForm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function FactionHub() {
    const factions = await getFactions();

    return (
        <main className="p-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Faction Hub</h1>

            <div className="grid md:grid-cols-2 gap-8">
                <section className="space-y-4">
                    <h2 className="text-xl font-semibold">Existing Factions</h2>
                    {factions.length === 0 ? (
                        <p className="text-neutral-500">No factions found.</p>
                    ) : (
                        <ul className="space-y-2">
                            {factions.map((f: any) => (
                                <li key={f.$id}>
                                    <Link href={`/faction/${f.$id}`} className="block p-4 bg-neutral-900 border border-neutral-800 rounded hover:border-blue-500 transition-colors">
                                        <div className="font-bold text-lg">{f.name}</div>
                                        <div className="text-sm text-neutral-400">ID: {f.$id}</div>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="p-6 border border-neutral-800 rounded bg-neutral-900/50">
                    <h2 className="text-xl font-semibold mb-4">Create New Faction</h2>
                    <CreateFactionForm />
                </section>
            </div>

            <div className="mt-8">
                <Link href="/" className="text-neutral-400 hover:text-white">← Back to Galaxy Map</Link>
            </div>
        </main>
    );
}
