import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Props {
  slug: string;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  q: string;
  sort: string;
  dir: string;
}

export function Pagination({ slug, page, pageCount, total, pageSize, q, sort, dir }: Props) {
  function href(p: number) {
    const params = new URLSearchParams({ sort, dir, page: String(p) });
    if (q) params.set("q", q);
    return `/w/${slug}?${params.toString()}`;
  }
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p>
        Showing {from}–{to} of {total} {total === 1 ? "account" : "accounts"}
      </p>
      <div className="flex items-center gap-2">
        <PageButton href={page > 1 ? href(page - 1) : null} label="Previous page">
          Previous
        </PageButton>
        <span aria-current="page">
          Page {page} of {pageCount}
        </span>
        <PageButton href={page < pageCount ? href(page + 1) : null} label="Next page">
          Next
        </PageButton>
      </div>
    </nav>
  );
}

function PageButton({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  if (href === null) {
    return (
      <Button type="button" variant="outline" size="sm" disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href} aria-label={label}>
        {children}
      </Link>
    </Button>
  );
}
