import { AppHeader } from "@/components/app-shell/app-header";

// Signed-in area. Each page still authorizes itself on the server (requireUser & co.).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <div className="flex-1">{children}</div>
    </>
  );
}
