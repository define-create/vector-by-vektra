-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "UserPlan" AS ENUM ('free', 'pro');

-- CreateEnum
CREATE TYPE "TrustTier" AS ENUM ('unverified', 'verified_email');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('manual', 'future_scraped');

-- CreateEnum
CREATE TYPE "RatingRunType" AS ENUM ('nightly', 'admin');

-- CreateEnum
CREATE TYPE "RatingRunStatus" AS ENUM ('running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('void_match', 'merge_player', 'edit_player_identity', 'claim_profile', 'trigger_recompute', 'rename_tag', 'delete_player', 'unclaim_profile');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('Match', 'Player', 'RatingRun');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "plan" "UserPlan" NOT NULL DEFAULT 'free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3),
    "trustTier" "TrustTier" NOT NULL DEFAULT 'unverified',
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "ratingConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingVolatility" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "enteredByUserId" TEXT NOT NULL,
    "matchDate" TIMESTAMP(3) NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "dataSource" "DataSource" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchParticipant" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "team" INTEGER NOT NULL,

    CONSTRAINT "MatchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "gameOrder" INTEGER NOT NULL,
    "team1Score" INTEGER NOT NULL,
    "team2Score" INTEGER NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingRun" (
    "id" TEXT NOT NULL,
    "runType" "RatingRunType" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "RatingRunStatus" NOT NULL DEFAULT 'running',
    "notes" TEXT,

    CONSTRAINT "RatingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingSnapshot" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "matchDate" TIMESTAMP(3) NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "effectiveK" DOUBLE PRECISION NOT NULL,
    "expectedScore" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RatingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "entityType" "AuditEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "actionType" "AuditActionType" NOT NULL,
    "adminUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "Player_userId_key" ON "Player"("userId");

-- Partial unique index: prevent duplicate unclaimed shadow profiles with the same displayName (case-insensitive)
CREATE UNIQUE INDEX "Player_shadow_displayname_unique"
ON "Player" (lower("displayName"))
WHERE "userId" IS NULL AND "claimed" = false AND "deletedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_enteredByUserId_fkey" FOREIGN KEY ("enteredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingSnapshot" ADD CONSTRAINT "RatingSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RatingRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingSnapshot" ADD CONSTRAINT "RatingSnapshot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingSnapshot" ADD CONSTRAINT "RatingSnapshot_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

