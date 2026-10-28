import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("common");
  return (
    <>
      <div className="flex-1">{children}</div>
      <footer className="px-4 py-6 text-center text-xs text-muted-foreground">
        {/* RN-023: terms are always reachable through a discreet footer link. */}
        <Link href="/terms" className="underline-offset-4 hover:underline">
          {t("terms")}
        </Link>
      </footer>
    </>
  );
}
