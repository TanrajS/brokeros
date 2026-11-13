import { Badge } from "@/components/ui/badge";
import type { RenewalStage } from "@/lib/domain/renewals";

const variantFor: Record<RenewalStage, "default" | "secondary" | "destructive" | "outline"> = {
  "Not yet due": "outline",
  "120-day: Strategy": "secondary",
  "90-day: Marketing": "secondary",
  "60-day: Quoting": "default",
  "30-day: Binding": "default",
  "Expired — action required": "destructive",
  Closed: "outline",
};

export function StageBadge({ stage }: { stage: RenewalStage }) {
  return (
    <Badge variant={variantFor[stage]} className="whitespace-nowrap">
      {stage}
    </Badge>
  );
}
