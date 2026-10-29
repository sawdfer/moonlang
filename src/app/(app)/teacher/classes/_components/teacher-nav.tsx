import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/teacher/agenda", key: "agenda" },
  { href: "/teacher/classes", key: "classes" },
  { href: "/teacher/agenda/blocks", key: "blocks" },
] as const;

/** Navigation between the class and agenda pages (F-003, F-004). */
export async function TeacherNav({ current }: { current: (typeof ITEMS)[number]["key"] }) {
  const t = await getTranslations("classes.nav");
  return (
    <nav className="mb-6 flex flex-wrap gap-2 text-sm">
      <Link href="/teacher" className="rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted">
        {t("home")}
      </Link>
      {ITEMS.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={current === item.key ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 hover:bg-muted",
            current === item.key && "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {t(item.key)}
        </Link>
      ))}
    </nav>
  );
}
