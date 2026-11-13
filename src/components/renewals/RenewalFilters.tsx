import Link from "next/link";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/form/NativeSelect";
import { RENEWAL_STAGES } from "@/lib/domain/renewals";
import type { RenewalsView } from "@/server/renewals/queries";
import { CleanGetForm } from "./CleanGetForm";
import { renewalsHref, type RenewalsQuery } from "./params";

/** A plain GET form: works without JavaScript and keeps filters in the URL. */
export function RenewalFilters({ slug, query, options }: { slug: string; query: RenewalsQuery; options: RenewalsView["options"] }) {
  const fields: { name: keyof RenewalsQuery; label: string; values: readonly string[] }[] = [
    { name: "producer", label: "Producer", values: options.producers },
    { name: "manager", label: "Account manager", values: options.managers },
    { name: "line", label: "Line", values: options.lines },
    { name: "carrier", label: "Carrier", values: options.carriers },
    { name: "stage", label: "Stage", values: RENEWAL_STAGES },
  ];
  const active = fields.some((f) => query[f.name]);
  return (
    <CleanGetForm action={`/w/${slug}/renewals`} aria-label="Filter renewals" className="flex flex-col gap-3">
      {query.view !== "board" ? <input type="hidden" name="view" value={query.view} /> : null}
      {query.dir !== "asc" ? <input type="hidden" name="dir" value={query.dir} /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {fields.map((f) => (
          <div key={f.name} className="flex flex-col gap-1.5">
            <Label htmlFor={`filter-${f.name}`}>{f.label}</Label>
            <NativeSelect id={`filter-${f.name}`} name={f.name} defaultValue={query[f.name]}>
              <option value="">All</option>
              {f.values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline">
          <Filter aria-hidden="true" />
          Apply filters
        </Button>
        {active ? (
          <Button asChild variant="ghost">
            <Link href={renewalsHref(slug, query, { producer: "", manager: "", line: "", carrier: "", stage: "" })}>Clear filters</Link>
          </Button>
        ) : null}
      </div>
    </CleanGetForm>
  );
}
