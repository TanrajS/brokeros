import { z } from "zod";
import { optionalEmailSchema, optionalText, requiredText } from "./common";

export const contactFormSchema = z.object({
  name: requiredText("Contact name", 120),
  role: optionalText(120),
  email: optionalEmailSchema,
  phone: optionalText(40),
});

export type ContactFormInput = z.input<typeof contactFormSchema>;
export type ContactFormValues = z.output<typeof contactFormSchema>;

export const emptyContactForm: ContactFormInput = { name: "", role: "", email: "", phone: "" };
