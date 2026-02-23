import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { PrismaClient } from "../app/generated/prisma/client";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const matchId = "cmlz91166000580utc4lq7jug";

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      participants: { include: { player: { select: { id: true, displayName: true, userId: true } } } },
      games: true,
    },
  });

  if (!match) {
    console.log("Match NOT FOUND in database");
    return;
  }

  console.log("\n=== MATCH ===");
  console.log("id:", match.id);
  console.log("matchDate:", match.matchDate);
  console.log("createdAt:", match.createdAt);
  console.log("voidedAt:", match.voidedAt ?? "null (not voided)");
  console.log("enteredByUserId:", match.enteredByUserId);

  console.log("\n=== PARTICIPANTS ===");
  for (const p of match.participants) {
    console.log(`  team ${p.team}: ${p.player.displayName} (playerId=${p.playerId}, userId=${p.player.userId ?? "null-shadow"})`);
  }

  console.log("\n=== GAMES ===");
  for (const g of match.games) {
    console.log(`  game ${g.gameOrder}: ${g.team1Score}–${g.team2Score}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: match.enteredByUserId },
    include: { player: true },
  });
  console.log("\n=== ENTERING USER ===");
  console.log("displayName:", user?.displayName);
  console.log("playerId:", user?.player?.id ?? "NO PLAYER RECORD");

  if (user?.player) {
    const inMatch = match.participants.some(p => p.playerId === user.player!.id);
    console.log("User's player in participants?", inMatch ? "YES" : "NO — match won't appear in their history!");
  }

  // Also check how many total matches exist for the entering user's player
  if (user?.player) {
    const count = await prisma.matchParticipant.count({
      where: { playerId: user.player.id, match: { voidedAt: null } },
    });
    console.log("Total non-voided matches for this player:", count);
  }
}

main().catch(console.error).finally(() => process.exit(0));
