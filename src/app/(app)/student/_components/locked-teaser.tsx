import { getTranslations } from "next-intl/server";

const AREAS = [
  { key: "materials", emoji: "📚" },
  { key: "recordings", emoji: "🎬" },
  { key: "progress", emoji: "📈" },
  { key: "tasks", emoji: "✍️" },
  { key: "posts", emoji: "💬" },
] as const;

/**
 * Locked preview of the areas a trial user can't open yet (RN-018, F-006).
 * Purely static: it never loads materials, recordings or anyone's data.
 */
export async function LockedTeasers() {
  const t = await getTranslations("studentLessons.locked");
  return (
    <section className="mt-10" aria-labelledby="locked-title">
      <h2 id="locked-title" className="font-display text-xl font-semibold">
        {t("title")}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{t("subtitle")}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {AREAS.map((area) => (
          <li
            key={area.key}
            className="relative overflow-hidden rounded-xl border border-dashed bg-muted/50 p-4"
          >
            <p className="font-semibold">
              <span aria-hidden>{area.emoji}</span> {t(`areas.${area.key}`)}
            </p>
            <div aria-hidden className="mt-3 flex flex-col gap-2 blur-[2px] select-none">
              <div className="h-3 w-3/4 rounded bg-border" />
              <div className="h-3 w-1/2 rounded bg-border" />
            </div>
            <p className="mt-3 text-sm">
              <span aria-hidden>🔒</span> {t("cta")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
