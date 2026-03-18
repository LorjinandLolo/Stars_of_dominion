import { Orbitron, Rajdhani } from 'next/font/google';
import '@/app/theme.css'; // New theme file
import '@/app/global.css';

import { initRegistries } from '@/lib/politics/registry';

const orbitron = Orbitron({ subsets: ['latin'], variable: '--font-orbitron' });
const rajdhani = Rajdhani({ weight: ['300', '400', '500', '600', '700'], subsets: ['latin'], variable: '--font-rajdhani' });

export const metadata = { title: 'Stars of Dominion' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Initialize server-side global JSON registries
  initRegistries();

  return (
    <html lang="en" className={`${orbitron.variable} ${rajdhani.variable}`}>
      <body>{children}</body>
    </html>
  );
}
