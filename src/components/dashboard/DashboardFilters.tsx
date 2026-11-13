import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/form/NativeSelect";
import { CleanGetForm } from "@/components/renewals/CleanGetForm";
import { FORWARD_MONTHS, LOOKBACK_MONTHS } from "@/lib/domain/dashboard";
import type { DashboardQuery } from "./params";

export function DashboardFilters({ slug, query, producers }: { slug: string; query: DashboardQuery; producers: string[] }) {
  return (
    <CleanGetForm action={`/w/${slug}/dashboard`} aria-label="Dashboard filters" className="flex flex-col gap-3">
      {query.retention ? <input type="hidden" name="retention" value={query.retention} /> : null}
      {query.rate ? <input type="hidden" name="rate" value={query.rate} /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dash-producer">Producer</Label>
          <NativeSelect id="dash-producer" name="producer" defaultValue={query.producer}>
            <option value="">All producers</option>
            {producers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dash-lookback">Lookback (retention)</Label>
          <NativeSelect id="dash-lookback" name="lookback" defaultValue={query.lookback === 12 ? "" : String(query.lookback)}>
            {LOOKBACK_MONTHS.map((m) => (
              <option key={m} value={m === 12 ? "" : String(m)}>
                Trailing {m} months{m === 12 ? " (default)" : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dash-forward">Forward (expiring)</Label>
          <NativeSelect id="dash-forward" name="forward" defaultValue={query.forward === 12 ? "" : String(query.forward)}>
            {FORWARD_MONTHS.map((m) => (
              <option key={m} value={m === 12 ? "" : String(m)}>
                Next {m} months{m === 12 ? " (default)" : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div>
        <Button type="submit" variant="outline">
          <Filter aria-hidden="true" />
          Apply
        </Button>
      </div>
    </CleanGetForm>
  );
}
