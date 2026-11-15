ALTER TABLE IF EXISTS "certificates" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "contract_requirements" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "quotes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "submissions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "certificates" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "contract_requirements" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "quotes" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "submissions" CASCADE;--> statement-breakpoint
ALTER TABLE "quote_options" DROP CONSTRAINT IF EXISTS "quote_options_source_quote_id_quotes_id_fk";
--> statement-breakpoint
ALTER TABLE "claims" ALTER COLUMN "line_of_business" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "policies" ALTER COLUMN "line_of_business" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."line_of_business";--> statement-breakpoint
CREATE TYPE "public"."line_of_business" AS ENUM('General Liability', 'Property', 'Commercial Auto', 'Umbrella/Excess', 'Professional Liability', 'Cyber', 'Equipment Breakdown');--> statement-breakpoint
ALTER TABLE "claims" ALTER COLUMN "line_of_business" SET DATA TYPE "public"."line_of_business" USING "line_of_business"::"public"."line_of_business";--> statement-breakpoint
ALTER TABLE "policies" ALTER COLUMN "line_of_business" SET DATA TYPE "public"."line_of_business" USING "line_of_business"::"public"."line_of_business";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "tolerance_occurrence" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "tolerance_year" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "permissible_loss_ratio" numeric(6, 3) DEFAULT 0.65 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "accepted_findings" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "reset_nightly" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "program_layers" DROP COLUMN "basis";--> statement-breakpoint
ALTER TABLE "quote_options" DROP COLUMN IF EXISTS "source_quote_id";--> statement-breakpoint
DROP TYPE "public"."decline_reason";--> statement-breakpoint
DROP TYPE "public"."layer_basis";--> statement-breakpoint
DROP TYPE "public"."requirement_coverage";--> statement-breakpoint
DROP TYPE "public"."submission_status";