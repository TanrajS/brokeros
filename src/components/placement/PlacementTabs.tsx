"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const tabs = [
  { segment: "loss-runs", label: "Loss Runs" },
  { segment: "program", label: "Program", hint: "v0.5" },
  { segment: "marketing", label: "Marketing", hint: "v0.6" },
  { segment: "strategy", label: "Strategy", hint: "v0.7" },
] as const;

export function PlacementTabs({ base }: { base: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Placement sections" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex gap-1 border-b">
        {tabs.map((t) => {
          const href = `${base}/${t.segment}`;
          const active = pathname.startsWith(href);
          return (
            <li key={t.segment} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {"hint" in t ? <span className="text-xs opacity-70">{t.hint}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
