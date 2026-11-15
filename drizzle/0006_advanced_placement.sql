CREATE TYPE "public"."deductible_kind" AS ENUM('flat', 'percent_of_loss', 'percent_of_value', 'waiting_period');--> statement-breakpoint
CREATE TYPE "public"."layer_basis" AS ENUM('per_occurrence', 'per_location', 'aggregate');--> statement-breakpoint
ALTER TYPE "public"."layer_type" ADD VALUE 'quota_share';--> statement-breakpoint
CREATE TABLE "layer_participations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"layer_id" uuid NOT NULL,
	"insurer" text NOT NULL,
	"written_line_pct" numeric(6, 3),
	"signed_line_pct" numeric(6, 3) NOT NULL,
	"premium" numeric(14, 2) NOT NULL,
	"policy_number" text,
	"is_lead" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_deductibles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"applies_to" text NOT NULL,
	"kind" "deductible_kind" NOT NULL,
	"amount" numeric(14, 2),
	"percent" numeric(6, 3),
	"minimum" numeric(14, 2),
	"maximum" numeric(14, 2),
	"hours" integer,
	"notes" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_layers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"line_group" "line_group" NOT NULL,
	"tower_label" text DEFAULT 'Tower 1' NOT NULL,
	"layer_type" "layer_type" NOT NULL,
	"attachment" numeric(14, 2) NOT NULL,
	"limit" numeric(14, 2) NOT NULL,
	"basis" "layer_basis" DEFAULT 'per_occurrence' NOT NULL,
	"policy_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "peril" text DEFAULT 'All other perils' NOT NULL;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "value_at_risk" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "layer_participations" ADD CONSTRAINT "layer_participations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layer_participations" ADD CONSTRAINT "layer_participations_layer_id_program_layers_id_fk" FOREIGN KEY ("layer_id") REFERENCES "public"."program_layers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_deductibles" ADD CONSTRAINT "policy_deductibles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_deductibles" ADD CONSTRAINT "policy_deductibles_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_layers" ADD CONSTRAINT "program_layers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_layers" ADD CONSTRAINT "program_layers_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_layers" ADD CONSTRAINT "program_layers_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "layer_participations_layer_idx" ON "layer_participations" USING btree ("layer_id");--> statement-breakpoint
CREATE INDEX "layer_participations_workspace_idx" ON "layer_participations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "policy_deductibles_policy_idx" ON "policy_deductibles" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "policy_deductibles_workspace_idx" ON "policy_deductibles" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_deductibles_default_idx" ON "policy_deductibles" USING btree ("policy_id") WHERE "policy_deductibles"."is_default" = true;--> statement-breakpoint
CREATE INDEX "program_layers_account_group_idx" ON "program_layers" USING btree ("account_id","line_group");--> statement-breakpoint
CREATE INDEX "program_layers_workspace_idx" ON "program_layers" USING btree ("workspace_id");