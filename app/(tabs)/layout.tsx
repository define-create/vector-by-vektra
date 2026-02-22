import BottomNav from "@/components/nav/BottomNav";

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Main content — pad bottom to clear fixed nav */}
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
