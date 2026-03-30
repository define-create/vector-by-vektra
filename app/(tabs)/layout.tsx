import BottomNav from "@/components/nav/BottomNav";
import TopHeader from "@/components/nav/TopHeader";

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopHeader />
      {/* Main content scrolls within this container — header and footer are part of flex flow */}
      <main className="flex-1 overflow-y-auto mx-auto w-full max-w-xl">{children}</main>
      <BottomNav />
    </div>
  );
}
