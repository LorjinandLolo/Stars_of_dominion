/** @type {import('next').NextConfig} */
const nextConfig = {
    // turbopack: { root: '.' } is deprecated or needs to be absolute.
    // Removing it allows Next.js to use its default absolute path resolution.

    // Allow other devices to load dev-server resources when testing multiplayer
    // over the LAN or a tunnel. Next.js 16 blocks cross-origin dev requests by
    // default. Dev-only setting — ignored in production builds.
    allowedDevOrigins: [
        'localhost',
        '127.0.0.1',
        '192.168.2.117',   // this machine's LAN address (update if your IP changes)
        '192.168.*.*',     // any device on a typical home network
        '10.*.*.*',
        '*.loca.lt',       // localtunnel links for playing over the internet
        '*.ngrok-free.app',
        '*.trycloudflare.com',
    ],
};

export default nextConfig;
