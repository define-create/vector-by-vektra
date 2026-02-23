import Link from "next/link";

const LINKS = [
  {
    href: "/admin/matches",
    title: "Void Matches",
    description: "Search and void incorrect match records.",
  },
  {
    href: "/admin/players",
    title: "Merge / Edit Players",
    description: "Merge duplicate profiles or edit player display names.",
  },
  {
    href: "/admin/recompute",
    title: "Recompute Ratings",
    description: "Trigger a manual rating recompute or view run status.",
  },
  {
    href: "/admin/audit",
    title: "Audit Log",
    description: "Read-only record of all admin actions.",
  },
];

export default function AdminIndexPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-zinc-50">Admin Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 hover:border-zinc-600 hover:bg-zinc-800 transition-colors"
          >
            <p className="font-semibold text-zinc-100">{link.title}</p>
            <p className="mt-1 text-sm text-zinc-400">{link.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
