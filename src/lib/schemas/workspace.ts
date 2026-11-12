import { z } from "zod";
import { isoDateSchema, requiredText } from "./common";

export const workspaceSettingsSchema = z.object({
  name: requiredText("Workspace name", 80),
  asOfDate: isoDateSchema,
});
export type WorkspaceSettingsInput = z.input<typeof workspaceSettingsSchema>;
export type WorkspaceSettingsValues = z.output<typeof workspaceSettingsSchema>;

export const RESET_CONFIRMATION = "RESET";
export const resetWorkspaceSchema = z.object({
  confirmation: z.string().refine((s) => s === RESET_CONFIRMATION, `Type ${RESET_CONFIRMATION} to confirm`),
});
