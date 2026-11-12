import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Renders an em dash for a missing value, with a tooltip (hover or keyboard
 * focus) naming exactly what is missing. Never render NaN or a silent 0.
 */
export function Missing({ what }: { what: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="cursor-help text-muted-foreground" aria-label={`${what} not entered`}>
          —
        </span>
      </TooltipTrigger>
      <TooltipContent>{what} not entered</TooltipContent>
    </Tooltip>
  );
}

/** Shows `text` or, when it is null, a Missing marker naming `what`. */
export function ValueOrMissing({ text, what }: { text: string | null; what: string }) {
  return text === null ? <Missing what={what} /> : <>{text}</>;
}
