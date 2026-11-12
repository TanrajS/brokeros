import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BookToolbar({ slug, q, sort, dir }: { slug: string; q: string; sort: string; dir: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <form action={`/w/${slug}`} method="get" role="search" className="flex items-end gap-2">
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="book-search">Search accounts</Label>
          <Input id="book-search" name="q" defaultValue={q} placeholder="Name, industry or producer" className="w-64 max-w-full" />
        </div>
        <Button type="submit" variant="outline" aria-label="Search">
          <Search aria-hidden="true" />
          <span className="hidden sm:inline">Search</span>
        </Button>
        {q ? (
          <Button asChild variant="ghost">
            <Link href={`/w/${slug}?sort=${sort}&dir=${dir}`}>Clear</Link>
          </Button>
        ) : null}
      </form>
      <Button asChild>
        <Link href={`/w/${slug}/accounts/new`}>
          <Plus aria-hidden="true" />
          Add account
        </Link>
      </Button>
    </div>
  );
}
