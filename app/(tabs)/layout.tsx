import BottomNav from "@/components/nav/BottomNav";
import TopHeader from "@/components/nav/TopHeader";

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopHeader />
      {/* Main content — pad top to clear fixed header, bottom to clear fixed nav */}
      <main className="flex-1 pt-14 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
