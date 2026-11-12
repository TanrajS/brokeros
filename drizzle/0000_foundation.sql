CREATE TYPE "public"."account_status" AS ENUM('prospect', 'active', 'lost');--> statement-breakpoint
CREATE TYPE "public"."endorsement" AS ENUM('additional_insured', 'waiver_of_subrogation', 'primary_noncontributory', 'notice_of_cancellation_30');--> statement-breakpoint
CREATE TYPE "public"."exposure_basis" AS ENUM('revenue', 'payroll', 'vehicles', 'square_feet', 'employees', 'other');--> statement-breakpoint
CREATE TYPE "public"."line_of_business" AS ENUM('General Liability', 'Property', 'Commercial Auto', 'Umbrella/Excess', 'Workers Compensation', 'Professional Liability', 'Cyber', 'Equipment Breakdown');--> statement-breakpoint
CREATE TYPE "public"."renewal_status" AS ENUM('not_started', 'in_progress', 'renewed', 'lost', 'non_renewed');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"industry" text NOT NULL,
	"annual_revenue" numeric(14, 2),
	"employee_count" integer,
	"province" text NOT NULL,
	"producer" text,
	"account_manager" text,
	"status" "account_status" DEFAULT 'prospect' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"carrier" text NOT NULL,
	"line_of_business" "line_of_business" NOT NULL,
	"policy_number" text,
	"effective_date" date NOT NULL,
	"expiry_date" date NOT NULL,
	"occurrence_limit" numeric(14, 2),
	"aggregate_limit" numeric(14, 2),
	"deductible" numeric(14, 2),
	"annual_premium" numeric(14, 2) NOT NULL,
	"commission_rate" numeric(6, 3) NOT NULL,
	"exposure_basis" "exposure_basis" NOT NULL,
	"exposure_amount" numeric(14, 2),
	"endorsements" "endorsement"[] DEFAULT '{}'::endorsement[] NOT NULL,
	"renewal_status" "renewal_status" DEFAULT 'not_started' NOT NULL,
	"previous_policy_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"as_of_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_previous_policy_id_policies_id_fk" FOREIGN KEY ("previous_policy_id") REFERENCES "public"."policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_workspace_idx" ON "accounts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "accounts_workspace_name_idx" ON "accounts" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "contacts_account_idx" ON "contacts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "contacts_workspace_idx" ON "contacts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "policies_account_idx" ON "policies" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "policies_workspace_idx" ON "policies" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "policies_workspace_expiry_idx" ON "policies" USING btree ("workspace_id","expiry_date");