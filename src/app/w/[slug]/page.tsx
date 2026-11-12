import type { Metadata } from "next";
import { BookTable } from "@/components/book/BookTable";
import { BookToolbar } from "@/components/book/BookToolbar";
import { Pagination } from "@/components/book/Pagination";
import { WelcomeCard } from "@/components/book/WelcomeCard";
import { BOOK_SORT_KEYS, listBook, type BookSortKey } from "@/server/accounts/queries";
import { requireWorkspace } from "./lib";

export const metadata: Metadata = { title: "Book" };

const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function BookPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const ws = await requireWorkspace(slug);

  const q = first(sp.q);
  const sortRaw = first(sp.sort);
  const sort: BookSortKey = (BOOK_SORT_KEYS as readonly string[]).includes(sortRaw) ? (sortRaw as BookSortKey) : "nextExpiry";
  const dir = first(sp.dir) === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number.parseInt(first(sp.page) || "1", 10) || 1);

  const book = await listBook(ws.id, ws.asOfDate, { q, sort, dir, page, pageSize: PAGE_SIZE });
  const isEmptyWorkspace = book.total === 0 && q === "";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Book</h1>
        <p className="text-sm text-muted-foreground">Every account in this workspace, with days to expiry counted from the as-of date.</p>
      </div>

      {isEmptyWorkspace ? (
        <WelcomeCard slug={slug} />
      ) : (
        <>
          <BookToolbar slug={slug} q={q} sort={sort} dir={dir} />
          {book.rows.length === 0 ? (
            <p className="rounded-lg border p-6 text-sm text-muted-foreground">No accounts match “{q}”.</p>
          ) : (
            <BookTable slug={slug} rows={book.rows} sort={sort} dir={dir} q={q} />
          )}
          <Pagination slug={slug} page={book.page} pageCount={book.pageCount} total={book.total} pageSize={PAGE_SIZE} q={q} sort={sort} dir={dir} />
        </>
      )}
    </div>
  );
}
