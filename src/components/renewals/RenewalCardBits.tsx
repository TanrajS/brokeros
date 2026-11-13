import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function OverdueTasks({ count }: { count: number }) {
  if (count === 0) return <span className="text-xs text-muted-foreground">No overdue tasks</span>;
  return (
    <Badge variant="destructive" className="gap-1">
      <AlertTriangle className="size-3" aria-hidden="true" />
      {count} overdue {count === 1 ? "task" : "tasks"}
    </Badge>
  );
}
