# Testing Stars of Dominion with a Friend

The simplest possible two-player playtest. Your computer hosts everything;
your friend just opens a link in their browser.

Two dev accounts are prepared for you:

| Player | Login | Password | Faction |
|---|---|---|---|
| **You** | `dev1@stars.com` | `password123` | Aurelian Hegemony |
| **Friend** | `dev2@stars.com` | `password123` | Vektori Technocracy |

---

## One-time setup (do this once)

**1. Create the dev accounts and claim the factions:**

```
npm run setup:duel
```

Re-run this any time you want to reset the two dev claims.

**2. Start the database (once per boot):**

```
docker compose up -d
```

Everything (game state, accounts, sessions) lives in this local PostgreSQL
container — your friend's browser only ever talks to YOUR computer, so there
is no cloud console or CORS setup anymore.

---

## Every play session

Open **two terminals** in the project folder:

```
Terminal 1:   npm run dev:lan      ← the game website (visible on your network)
Terminal 2:   npm run worker       ← the game engine (REQUIRED — no worker, no game)
```

> The worker is the authoritative simulation. If it isn't running, orders
> queue up but nothing ever happens.

### You

Open `http://localhost:3000/login`, sign in as **dev1@stars.com**,
pick **Aurelian Hegemony** in the lobby.

### Your friend — same Wi-Fi / LAN

1. Find your local IP: run `ipconfig` in a terminal and look for
   **IPv4 Address** (something like `192.168.1.23`).
2. Friend opens `http://192.168.1.23:3000/login` (your IP, port 3000),
   signs in as **dev2@stars.com**, picks **Vektori Technocracy**.
3. If it doesn't load: the first time you run `dev:lan`, Windows shows a
   **firewall prompt** — click *Allow*. (If you missed it: Windows Security →
   Firewall → Allow an app → Node.js, allow on Private networks.)

### Your friend — somewhere else on the internet

Easiest option — a temporary public tunnel to your machine:

```
npx localtunnel --port 3000
```

It prints a URL like `https://something.loca.lt` — send that to your friend
(they may need to click through a one-time confirmation page).
Alternatives: `ngrok http 3000` (needs a free account) or Cloudflare Tunnel.

Keep the tunnel terminal open while you play. The `*` platform wildcard from
one-time setup step 2 covers the tunnel domain too.

---

## What you should see

- Your own orders (fleet moves etc.) appear **instantly** with a small
  "syncing" chip bottom-left; the chip clears within ~5–10 seconds.
- Your friend sees the result of your orders within ~5–10 seconds
  (the worker resolves every 5 s), and vice versa.
- You each only control your own faction — trying to move the other
  player's fleets is rejected server-side.

## Fun things to test together

1. Both move fleets at the same time — do both moves survive?
2. Move a fleet into your friend's home system — do they see you arrive?
3. Declare war / send an envoy — does the other player see it?
4. Queue a building each on your own planets — both complete?
5. Close the browser, reopen — is everything still where you left it?

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Friend's page loads but login fails / hangs | Database not running (`docker compose up -d`), or restart `npm run dev:lan` |
| "Faction already claimed by another player" | `npm run setup:duel` to reset the dev claims |
| Orders stuck on "syncing", nothing happens | The worker isn't running — start `npm run worker` |
| Friend can't reach your IP at all | Windows Firewall (allow Node.js), or you're on different networks — use the tunnel instead |
| "No multiplayer session found" from setup | Run `npx tsx scripts/push-init-state.ts`, then `npm run setup:duel` again |
| Everything is weird / want a fresh start | `npx tsx scripts/push-init-state.ts` re-seeds the world, then restart the worker |
