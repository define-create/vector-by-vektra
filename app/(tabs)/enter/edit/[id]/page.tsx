import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import EditMatchClient from "@/components/enter/EditMatchClient";

export const dynamic = "force-dynamic";

export default async function EditMatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/sign-in");

  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id, voidedAt: null },
    include: {
      participants: {
        include: { player: { select: { id: true, displayName: true } } },
        orderBy: { team: "asc" },
      },
      games: { orderBy: { gameOrder: "asc" } },
    },
  });

  if (!match) redirect("/command");
  if (match.enteredByUserId !== session.user.id) redirect("/command");

  const editExpiresAt = new Date(match.createdAt.getTime() + 60 * 60 * 1000);
  if (new Date() > editExpiresAt) redirect("/command");

  const team1 = match.participants
    .filter((p) => p.team === 1)
    .map((p) => p.player.displayName);
  const team2 = match.participants
    .filter((p) => p.team === 2)
    .map((p) => p.player.displayName);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-5">
      <EditMatchClient
        matchId={id}
        expiresAt={editExpiresAt.toISOString()}
        team1={team1}
        team2={team2}
        initialGames={match.games.map((g) => ({
          gameOrder: g.gameOrder,
          team1Score: g.team1Score,
          team2Score: g.team2Score,
        }))}
        initialTag={match.tag ?? ""}
      />
    </div>
  );
}
