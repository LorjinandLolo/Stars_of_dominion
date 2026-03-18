import Link from 'next/link';
import { LayoutDashboard, Users, Map, Settings } from 'lucide-react';

export default function Navbar() {
    return (
        <nav className="flex items-center justify-between px-6 py-4 bg-black/50 backdrop-blur-md border-b border-neutral-800 sticky top-0 z-50">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center font-bold text-white">S</div>
                <span className="font-bold text-lg tracking-wide">STARS OF DOMINION</span>
            </div>

            <div className="flex items-center gap-6">
                <Link href="/" className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-sm font-medium">
                    <LayoutDashboard size={16} />
                    <span>Dashboard</span>
                </Link>
                <Link href="/faction" className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-sm font-medium">
                    <Users size={16} />
                    <span>Factions</span>
                </Link>
                <button className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-sm font-medium cursor-not-allowed opacity-50">
                    <Map size={16} />
                    <span>Galaxy</span>
                </button>
                <button className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-sm font-medium cursor-not-allowed opacity-50">
                    <Settings size={16} />
                    <span>Settings</span>
                </button>
            </div>
        </nav>
    );
}
