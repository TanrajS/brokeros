import { z } from "zod";
import { ACCOUNT_STATUSES, INDUSTRIES, PROVINCES } from "@/lib/constants";
import { optionalCurrencySchema, optionalIntegerSchema, optionalText, requiredText } from "./common";

export const accountFormSchema = z.object({
  name: requiredText("Account name"),
  industry: z.enum(INDUSTRIES, { error: "Choose an industry" }),
  annualRevenue: optionalCurrencySchema,
  employeeCount: optionalIntegerSchema,
  province: z.enum(PROVINCES, { error: "Choose a province" }),
  producer: optionalText(120),
  accountManager: optionalText(120),
  status: z.enum(ACCOUNT_STATUSES, { error: "Choose a status" }),
  notes: optionalText(5000),
});

export type AccountFormInput = z.input<typeof accountFormSchema>;
export type AccountFormValues = z.output<typeof accountFormSchema>;

export const emptyAccountForm: AccountFormInput = {
  name: "",
  industry: "other",
  annualRevenue: "",
  employeeCount: "",
  province: "ON",
  producer: "",
  accountManager: "",
  status: "prospect",
  notes: "",
};
