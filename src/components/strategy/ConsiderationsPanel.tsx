import type { Consideration } from "@/lib/domain/strategy";

/** What favours a lower and a higher retention, in neutral terms, with the account's own figure for each topic. */
export function ConsiderationsPanel({ items, print = false }: { items: Consideration[]; print?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <p className={print ? "text-xs" : "text-sm text-muted-foreground"}>
        Nothing here ranks the options. Each topic states what the account&apos;s own figures show, then what would favour a lower retention and what would favour a higher one.
      </p>
      <ul className={print ? "flex flex-col gap-2 text-xs" : "grid gap-3 md:grid-cols-2"}>
        {items.map((c) => (
          <li key={c.topic} className="flex flex-col gap-1.5 rounded-lg border p-3">
            <h3 className="font-semibold">{c.topic}</h3>
            <p>{c.observation}</p>
            <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[7.5rem_1fr]">
              <dt className="text-xs font-medium text-muted-foreground">Favours lower</dt>
              <dd className="text-xs">{c.favoursLower}</dd>
              <dt className="text-xs font-medium text-muted-foreground">Favours higher</dt>
              <dd className="text-xs">{c.favoursHigher}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
