import { z } from "zod";
import { requiredText } from "./common";

export const customChecklistItemSchema = z.object({
  label: requiredText("Item", 160),
  required: z.boolean(),
});
export type CustomChecklistItemInput = z.input<typeof customChecklistItemSchema>;
export type CustomChecklistItemValues = z.output<typeof customChecklistItemSchema>;
