# Stars of Dominion — single image for both the web app and the game-loop worker.
# The prod compose file runs it twice with different commands:
#   app:    next start          (default CMD)
#   worker: tsx scripts/game-loop.ts
FROM node:22-bookworm-slim

# Prisma's query engine needs OpenSSL at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first so Docker caches this layer between code changes.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .

# Prisma client is generated into lib/generated/prisma (gitignored, so it must
# be generated inside the image). Does not need a database connection.
RUN npx prisma generate

# Build needs no database either; pages fetch game state client-side by
# polling /api/game/sync.
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npx", "next", "start"]
