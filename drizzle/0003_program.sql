CREATE TYPE "public"."layer_type" AS ENUM('primary', 'umbrella', 'excess');--> statement-breakpoint
CREATE TYPE "public"."line_group" AS ENUM('gl', 'auto');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('lead', 'follow');--> statement-breakpoint
CREATE TYPE "public"."requirement_coverage" AS ENUM('General Liability', 'Umbrella/Excess', 'Commercial Auto', 'Workers Compensation');--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"holder" text NOT NULL,
	"operations_description" text,
	"coverages" "line_of_business"[] DEFAULT '{}'::line_of_business[] NOT NULL,
	"required_by" date,
	"issued_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"contract_name" text NOT NULL,
	"counterparty" text NOT NULL,
	"coverage" "requirement_coverage" NOT NULL,
	"required_occurrence" numeric(14, 2),
	"required_aggregate" numeric(14, 2),
	"required_endorsements" "endorsement"[] DEFAULT '{}'::endorsement[] NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"carrier" text NOT NULL,
	"role" "participant_role" DEFAULT 'follow' NOT NULL,
	"signed_line" numeric(6, 3) NOT NULL,
	"premium" numeric(14, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_sublimits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"name" text NOT NULL,
	"limit" numeric(14, 2),
	"deductible" numeric(14, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tower_layers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"line_group" "line_group" NOT NULL,
	"layer_type" "layer_type" NOT NULL,
	"attachment" numeric(14, 2) NOT NULL,
	"limit" numeric(14, 2) NOT NULL,
	"premium" numeric(14, 2) NOT NULL,
	"carrier" text NOT NULL,
	"policy_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN "insurable_value" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN "coinsurance_percent" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_requirements" ADD CONSTRAINT "contract_requirements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_requirements" ADD CONSTRAINT "contract_requirements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_participants" ADD CONSTRAINT "policy_participants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_participants" ADD CONSTRAINT "policy_participants_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_sublimits" ADD CONSTRAINT "policy_sublimits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_sublimits" ADD CONSTRAINT "policy_sublimits_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tower_layers" ADD CONSTRAINT "tower_layers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tower_layers" ADD CONSTRAINT "tower_layers_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tower_layers" ADD CONSTRAINT "tower_layers_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "certificates_account_idx" ON "certificates" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "certificates_workspace_idx" ON "certificates" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "contract_requirements_account_idx" ON "contract_requirements" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "contract_requirements_workspace_idx" ON "contract_requirements" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "policy_participants_policy_idx" ON "policy_participants" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "policy_participants_workspace_idx" ON "policy_participants" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "policy_sublimits_policy_idx" ON "policy_sublimits" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "policy_sublimits_workspace_idx" ON "policy_sublimits" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "tower_layers_account_group_idx" ON "tower_layers" USING btree ("account_id","line_group");--> statement-breakpoint
CREATE INDEX "tower_layers_workspace_idx" ON "tower_layers" USING btree ("workspace_id");