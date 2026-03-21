import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCommandData } from "@/lib/services/command";
import { ClaimProfilePrompt } from "@/components/command/ClaimProfilePrompt";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/sign-in");

  // Direct uncached check — cache cannot interfere with this redirect
  const playerExists = await prisma.player.findFirst({
    where: { userId: session.user.id, deletedAt: null },
    select: { id: true },
  });
  if (playerExists) redirect("/command");

  const data = await getCommandData(session.user.id);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-5">
      <ClaimProfilePrompt
        emailVerified={data.emailVerified}
        userDisplayName={data.userDisplayName}
        userEmail={session.user.email ?? undefined}
      />
    </div>
  );
}
