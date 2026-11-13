import { z } from "zod";
import { requiredText } from "./common";

export const noteFormSchema = z.object({
  body: requiredText("Note", 4000),
});
export type NoteFormInput = z.input<typeof noteFormSchema>;
export type NoteFormValues = z.output<typeof noteFormSchema>;
