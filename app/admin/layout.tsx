import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";

const NAV_LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/matches", label: "Matches" },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/recompute", label: "Recompute" },
  { href: "/admin/tags", label: "Tags" },
  { href: "/admin/audit", label: "Audit Log" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // Defense in depth — middleware already redirects non-admins
  if (!session?.user?.id || session.user.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      {/* Admin top nav */}
      <nav className="border-b border-zinc-800 bg-zinc-900 px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <span className="text-sm font-bold tracking-widest text-zinc-400 uppercase">
            Vector Admin
          </span>
          <div className="flex gap-1 overflow-x-auto">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
