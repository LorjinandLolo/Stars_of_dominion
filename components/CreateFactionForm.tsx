'use client';

import { createFactionAction } from '@/app/actions/factions';

export default function CreateFactionForm() {
    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const name = formData.get('name') as string;
        await createFactionAction(name);
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium mb-1">Faction Name</label>
                <input
                    type="text"
                    name="name"
                    className="w-full bg-black border border-neutral-700 rounded px-3 py-2 focus:outline-none focus:border-blue-500"
                    placeholder="e.g. Terran Empire"
                    required
                />
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded transition-colors">
                Initialize Faction
            </button>
        </form>
    );
}
