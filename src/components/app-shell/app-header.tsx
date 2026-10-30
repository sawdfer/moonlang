import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SignOutButton } from "@/components/forms/sign-out-button";
import { NotificationBell } from "@/components/notifications";
import { UserPreferenceSwitchers } from "@/components/preferences";
import { isAdmin, isStaff, type Role } from "@/server/auth/roles";
import { getCurrentUser } from "@/server/auth/session";

type NavItem = { href: string; key: string };

function navFor(role: Role): NavItem[] {
  if (!isStaff(role)) {
    // Trial users also see finance: they pay the first charge there (RN-025).
    return [
      { href: "/student/lessons", key: "lessons" },
      { href: "/student/finance", key: "finance" },
      { href: "/student/profile", key: "profile" },
    ];
  }
  const items: NavItem[] = [
    { href: "/teacher", key: "dashboard" },
    { href: "/teacher/agenda", key: "agenda" },
    { href: "/teacher/classes", key: "classes" },
    { href: "/teacher/students", key: "students" },
    { href: "/teacher/finance", key: "finance" },
    { href: "/teacher/whatsapp", key: "whatsapp" },
    { href: "/teacher/announcements", key: "announcements" },
    { href: "/team/invites", key: "invites" },
  ];
  if (isAdmin(role)) {
    items.push({ href: "/team/staff", key: "staff" }, { href: "/admin/settings", key: "settings" });
  }
  return items;
}

/** Header of every signed-in page: navigation by role, language and theme (F-010), notifications and sign out. */
export async function AppHeader() {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getTranslations("nav");
  const items = navFor(user.role);

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link
          href={isStaff(user.role) ? "/teacher" : "/student/lessons"}
          className="font-display text-xl font-semibold"
        >
          🌙 Moonlang
        </Link>
        <nav aria-label={t("label")} className="flex flex-1 gap-1 overflow-x-auto text-sm">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-lg px-3 py-2 hover:bg-muted"
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>
        <Link href="/account/security" className="hidden rounded-lg px-3 py-2 text-sm hover:bg-muted sm:block">
          {t("account")}
        </Link>
        <UserPreferenceSwitchers className="hidden xl:flex" />
        <NotificationBell />
        <SignOutButton variant="ghost" />
      </div>
      {/* On small screens the switchers get their own row so the navigation keeps its space. */}
      <div className="mx-auto flex max-w-6xl justify-end px-4 pb-3 xl:hidden">
        <UserPreferenceSwitchers />
      </div>
    </header>
  );
}
