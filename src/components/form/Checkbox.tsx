import * as React from "react";
import { cn } from "cn";

/** Native checkbox with a label; works with react-hook-form's register(). */
export const NativeCheckbox = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { label: string }
>(function NativeCheckbox({ className, label, id, ...props }, ref) {
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-center gap-2 text-sm", className)}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="size-4 rounded border-input accent-primary focus-visible:outline-3 focus-visible:outline-ring/50"
        {...props}
      />
      {label}
    </label>
  );
});
