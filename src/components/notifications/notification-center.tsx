"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { getMyNotifications, markNotificationsRead } from "@/server/notifications/actions";
import type { NotificationItem } from "@/server/notifications/queries";

type State = { items: NotificationItem[]; unread: number };

/** Bell with unread count and a dropdown list (F-008). Rendered by `NotificationBell`. */
export function NotificationCenter({ initial }: { initial: State }) {
  const t = useTranslations("notifications.center");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const router = useRouter();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(initial);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(() => {
    startTransition(async () => {
      try {
        setState(await getMyNotifications());
        setError(false);
      } catch {
        setError(true);
      }
    });
  }, []);

  // Refresh when the tab regains focus, so the count stays current without polling.
  useEffect(() => {
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) reload();
  }

  function markRead(ids: string[] | "all") {
    setState((s) => ({
      items: s.items.map((n) => (ids === "all" || ids.includes(n.id) ? { ...n, read: true } : n)),
      unread:
        ids === "all"
          ? 0
          : Math.max(0, s.unread - s.items.filter((n) => !n.read && ids.includes(n.id)).length),
    }));
    startTransition(async () => {
      try {
        await markNotificationsRead(ids);
      } catch {
        setError(true);
      }
    });
  }

  function openItem(item: NotificationItem) {
    if (!item.read) markRead([item.id]);
    if (item.link) {
      setOpen(false);
      router.push(item.link);
    }
  }

  const badge = state.unread > 99 ? "99+" : String(state.unread);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={
          state.unread > 0 ? `${t("open")} (${t("unread", { count: state.unread })})` : t("open")
        }
        className="relative inline-flex size-11 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Bell className="size-5" aria-hidden />
        {state.unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-5 rounded-full bg-accent px-1 text-center text-[11px] leading-5 font-bold text-accent-foreground">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label={t("title")}
          className="absolute right-0 top-full z-50 mt-2 flex max-h-[min(32rem,75vh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="font-display text-lg font-semibold">{t("title")}</h2>
            {state.unread > 0 && (
              <button
                type="button"
                onClick={() => markRead("all")}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-muted"
              >
                <CheckCheck className="size-4" aria-hidden />
                {t("markAllRead")}
              </button>
            )}
          </div>

          {error && (
            <p role="alert" className="px-4 py-2 text-sm text-destructive">
              {t("error")}
            </p>
          )}

          {state.items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {pending ? "…" : t("empty")}
            </p>
          ) : (
            <ul className="overflow-y-auto">
              {state.items.map((item) => (
                <li key={item.id} className="border-b last:border-b-0">
                  <div className={cn("flex gap-3 px-4 py-3", !item.read && "bg-primary/5")}>
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        item.read ? "bg-transparent" : "bg-primary",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className={cn("text-sm", !item.read && "font-semibold")}>{item.title}</p>
                      {item.body && (
                        <p className="mt-0.5 line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">
                          {item.body}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {format.relativeTime(new Date(item.createdAt), now)}
                      </p>
                    </button>
                    {!item.read && (
                      <button
                        type="button"
                        onClick={() => markRead([item.id])}
                        aria-label={t("markRead")}
                        title={t("markRead")}
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                      >
                        <CheckCheck className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
