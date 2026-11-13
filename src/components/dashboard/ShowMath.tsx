/** Collapsible list of the arithmetic behind a figure, straight from a domain function's math.steps.lines. */
export function ShowMath({ lines, label = "Show the math" }: { lines: string[]; label?: string }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
        {label}
      </summary>
      <ol className="mt-2 flex max-h-64 list-decimal flex-col gap-0.5 overflow-auto pl-5 font-mono break-words">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
    </details>
  );
}
