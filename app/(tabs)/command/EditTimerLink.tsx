import Link from "next/link";
import { getCommandData, type CommandFilter } from "@/lib/services/command";
import EditTimer from "@/components/command/EditTimer";

export default async function EditTimerLink({
  userId,
  filter,
}: {
  userId: string;
  filter?: CommandFilter;
}) {
  const data = await getCommandData(userId, filter);

  if (!data.editTimer.expiresAt || !data.editTimer.matchId) return null;

  return (
    <div className="px-5 pb-5">
      <Link
        href={`/enter/edit/${data.editTimer.matchId}`}
        className="rounded-xl bg-zinc-800/60 px-4 py-3 flex items-center justify-between hover:bg-zinc-700/60 transition-colors"
      >
        <span className="text-sm text-zinc-400">Last match</span>
        <span className="text-xs text-zinc-500">Tap to edit</span>
        <EditTimer expiresAt={data.editTimer.expiresAt} />
      </Link>
    </div>
  );
}
