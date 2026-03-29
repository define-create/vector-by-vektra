import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DisplayNameEdit } from "@/components/command/DisplayNameEdit";
import { OptOutPredictionsToggle } from "./OptOutPredictionsToggle";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { SignOutButton } from "./SignOutButton";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/sign-in");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { displayName: true },
  });

  const myPlayer = await prisma.player.findFirst({
    where: { userId: session.user.id, deletedAt: null },
    select: { displayName: true, optOutPredictions: true },
  });

  const displayName = myPlayer?.displayName ?? user?.displayName ?? "";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-zinc-50">Profile</h1>
      </div>

      {/* Email */}
      <div className="mx-5 mb-3 rounded-xl bg-zinc-800/60 px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-zinc-400">Email</span>
        <span className="text-sm text-zinc-200">{session.user.email}</span>
      </div>

      {/* Display Name */}
      <div className="mx-5 mb-3 rounded-xl bg-zinc-800/60 px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-zinc-400">Display name</span>
        <DisplayNameEdit displayName={displayName} />
      </div>

      {/* Prediction opt-in */}
      {myPlayer && (
        <div className="mx-5 mb-3 rounded-xl bg-zinc-800/60 px-4 py-3">
          <OptOutPredictionsToggle optOutPredictions={myPlayer.optOutPredictions} />
        </div>
      )}

      {/* Change Password */}
      <div className="mx-5 mb-3 rounded-xl bg-zinc-800/60 px-4 py-4">
        <p className="text-sm font-semibold text-zinc-200 mb-3">Change Password</p>
        <ChangePasswordForm />
      </div>


      {/* Sign Out + Close */}
      <div className="mx-5 mb-5 mt-auto pt-4 flex gap-3">
        <SignOutButton />
        <Link
          href="/command"
          className="flex-1 rounded-xl border border-zinc-700 px-4 py-3 text-center text-sm font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
        >
          Close
        </Link>
      </div>
    </div>
  );
}
