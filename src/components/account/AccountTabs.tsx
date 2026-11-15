"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "cn";

export interface AccountTab {
  segment: "overview" | "loss-runs" | "program" | "marketing" | "strategy";
  label: string;
  /** Count badge; omitted when there is nothing to count. */
  count?: number;
}

/**
 * The account's tab strip (v1.3). Links styled as a tablist: arrow keys move
 * between tabs (roving tabindex), Enter follows the link, aria-selected marks the
 * open one. Scrolls horizontally at narrow widths.
 */
export function AccountTabs({ base, tabs }: { base: string; tabs: AccountTab[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const hrefOf = (t: AccountTab) => `${base}/${t.segment}`;
  const isActive = (t: AccountTab) => (t.segment === "overview" ? pathname === base || pathname.startsWith(`${base}/overview`) : pathname.startsWith(hrefOf(t)));
  const activeIndex = Math.max(0, tabs.findIndex(isActive));

  function onKeyDown(e: React.KeyboardEvent<HTMLAnchorElement>, i: number) {
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    refs.current[next]?.focus();
    // Arrow keys move focus and open the tab (automatic activation).
    router.push(hrefOf(tabs[next]));
  }

  return (
    <nav aria-label="Account sections" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul role="tablist" aria-orientation="horizontal" className="flex gap-1 border-b">
        {tabs.map((t, i) => {
          const active = i === activeIndex;
          return (
            <li key={t.segment} role="presentation" className="shrink-0">
              <Link
                ref={(el) => {
                  refs.current[i] = el;
                }}
                role="tab"
                href={hrefOf(t)}
                aria-selected={active}
                aria-current={active ? "page" : undefined}
                tabIndex={active ? 0 : -1}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={cn(
                  "-mb-px flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {t.count !== undefined ? (
                  <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-primary/10 text-foreground" : "bg-muted text-muted-foreground")} aria-label={`${t.count} ${t.label.toLowerCase()} items`}>
                    {t.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
