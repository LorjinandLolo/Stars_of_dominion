-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "multiplayer_sessions" (
    "id" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "lastTickAt" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "multiplayer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_orders" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "factionId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_factions" (
    "id" TEXT NOT NULL,
    "factionId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_factions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "factionId" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_saves" (
    "id" TEXT NOT NULL,
    "saveName" TEXT NOT NULL,
    "factionId" TEXT NOT NULL,
    "savedAt" TEXT NOT NULL,
    "tickIndex" INTEGER NOT NULL DEFAULT 0,
    "nowSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "snapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_saves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "world_state" (
    "id" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "resources" TEXT NOT NULL,

    CONSTRAINT "world_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "triggers" TEXT NOT NULL,
    "choices" TEXT NOT NULL,
    "effects" TEXT,
    "cooldown_days" INTEGER,
    "repeatable" BOOLEAN,
    "tags" TEXT,
    "newspaper" TEXT,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gazettes" (
    "id" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "lede" TEXT NOT NULL,
    "tone" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gazettes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "traits" TEXT,
    "resources" TEXT,
    "home_planet_id" TEXT,
    "inviteCode" TEXT,
    "governmentType" TEXT,
    "last_updated" TEXT,
    "income_rate" TEXT,

    CONSTRAINT "factions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "factionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permissions" TEXT NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "armies" (
    "id" TEXT NOT NULL,
    "faction_id" TEXT NOT NULL,
    "location_planet_id" TEXT NOT NULL,
    "units" TEXT NOT NULL,
    "status" TEXT,
    "x" INTEGER,
    "y" INTEGER,

    CONSTRAINT "armies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "owner_faction_id" TEXT,
    "ownerId" TEXT,
    "systemId" TEXT,
    "population" INTEGER,
    "attributes" TEXT,
    "resource_yield" TEXT,

    CONSTRAINT "planets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ships" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "faction_id" TEXT NOT NULL,
    "location_planet_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT,

    CONSTRAINT "ships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crises" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "attacker_id" TEXT NOT NULL,
    "defender_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "deadline" TEXT NOT NULL,
    "attacker_commitment" TEXT,
    "attacker_strategy" TEXT,
    "defender_response" TEXT,
    "resolution_result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "systems" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "q" DOUBLE PRECISION,
    "r" DOUBLE PRECISION,
    "security" DOUBLE PRECISION,
    "tradeValue" DOUBLE PRECISION,
    "regionId" TEXT,

    CONSTRAINT "systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_fleets" (
    "id" TEXT NOT NULL,
    "factionId" TEXT NOT NULL,
    "data" TEXT NOT NULL,

    CONSTRAINT "game_fleets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "game_orders_processed_createdAt_idx" ON "game_orders"("processed", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "player_profiles_userId_key" ON "player_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "player_profiles_factionId_key" ON "player_profiles"("factionId");

-- CreateIndex
CREATE INDEX "game_saves_factionId_idx" ON "game_saves"("factionId");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");

-- CreateIndex
CREATE INDEX "planets_systemId_idx" ON "planets"("systemId");

-- CreateIndex
CREATE INDEX "crises_defender_id_status_idx" ON "crises"("defender_id", "status");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
