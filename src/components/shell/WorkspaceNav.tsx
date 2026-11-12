"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarClock, LayoutDashboard, Settings, Briefcase } from "lucide-react";
import { cn } from "cn";

const items = [
  { href: "", label: "Book", icon: BookOpen },
  { href: "/renewals", label: "Renewals", icon: CalendarClock, hint: "v0.2" },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, hint: "v0.3" },
  { href: "/placement", label: "Placement", icon: Briefcase, hint: "v0.4" },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function WorkspaceNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/w/${slug}`;

  return (
    <nav aria-label="Workspace" className="md:w-52 md:shrink-0">
      <ul className="flex gap-1 overflow-x-auto px-2 py-2 md:flex-col md:px-3 md:py-4">
        {items.map(({ href, label, icon: Icon, ...rest }) => {
          const full = `${base}${href}`;
          const active = href === "" ? pathname === base || pathname.startsWith(`${base}/accounts`) : pathname.startsWith(full);
          const hint = "hint" in rest ? rest.hint : undefined;
          return (
            <li key={label} className="shrink-0">
              <Link
                href={full}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span>{label}</span>
                {hint ? <span className="ml-auto text-xs opacity-70">{hint}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
