import { z } from "zod";
import { isoDateSchema, optionalText, requiredText, uuidSchema } from "./common";

export const taskFormSchema = z.object({
  title: requiredText("Title", 160),
  dueDate: isoDateSchema,
  owner: optionalText(120),
  policyId: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s))
    .pipe(uuidSchema.nullable()),
});
export type TaskFormInput = z.input<typeof taskFormSchema>;
export type TaskFormValues = z.output<typeof taskFormSchema>;
