CREATE TYPE "public"."activity_kind" AS ENUM('note', 'stage_change', 'checklist_complete', 'outcome_recorded', 'outcome_undone');--> statement-breakpoint
CREATE TYPE "public"."checklist_source" AS ENUM('common', 'line', 'custom');--> statement-breakpoint
CREATE TYPE "public"."lost_reason" AS ENUM('price', 'coverage', 'service', 'business_closed', 'moved_broker', 'other');--> statement-breakpoint
CREATE TYPE "public"."outcome_type" AS ENUM('renewed', 'lost', 'non_renewed');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"policy_id" uuid,
	"kind" "activity_kind" NOT NULL,
	"body" text NOT NULL,
	"as_of_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"label" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"source" "checklist_source" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renewal_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"outcome" "outcome_type" NOT NULL,
	"lost_reason" "lost_reason",
	"reason" text,
	"competing_premium" numeric(14, 2),
	"successor_policy_id" uuid,
	"prior_status" "renewal_status" NOT NULL,
	"recorded_as_of" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"policy_id" uuid,
	"title" text NOT NULL,
	"due_date" date NOT NULL,
	"owner" text,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN "last_logged_stage" text;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_outcomes" ADD CONSTRAINT "renewal_outcomes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_outcomes" ADD CONSTRAINT "renewal_outcomes_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_outcomes" ADD CONSTRAINT "renewal_outcomes_successor_policy_id_policies_id_fk" FOREIGN KEY ("successor_policy_id") REFERENCES "public"."policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_account_idx" ON "activities" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "activities_workspace_idx" ON "activities" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_items_policy_label_uq" ON "checklist_items" USING btree ("policy_id","label");--> statement-breakpoint
CREATE INDEX "checklist_items_workspace_idx" ON "checklist_items" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "renewal_outcomes_policy_uq" ON "renewal_outcomes" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "renewal_outcomes_workspace_idx" ON "renewal_outcomes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "tasks_workspace_due_idx" ON "tasks" USING btree ("workspace_id","due_date");--> statement-breakpoint
CREATE INDEX "tasks_account_idx" ON "tasks" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "tasks_policy_idx" ON "tasks" USING btree ("policy_id");