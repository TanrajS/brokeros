import * as React from "react";
import { cn } from "cn";

/** A native <select> styled like the shadcn Input. Native keeps keyboard and mobile behaviour. */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(function NativeSelect(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={cn("native-control", className)} {...props} />;
});
