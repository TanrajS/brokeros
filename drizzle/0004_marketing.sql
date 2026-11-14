CREATE TYPE "public"."decline_reason" AS ENUM('class_of_business', 'capacity', 'loss_history', 'pricing', 'appetite', 'incomplete_information', 'other');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('planned', 'submitted', 'quoted', 'declined', 'no_response', 'bound');--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"quoted_premium" numeric(14, 2) NOT NULL,
	"occurrence_limit" numeric(14, 2),
	"aggregate_limit" numeric(14, 2),
	"deductible" numeric(14, 2),
	"endorsements" "endorsement"[] DEFAULT '{}'::endorsement[] NOT NULL,
	"commission_rate" numeric(6, 3) NOT NULL,
	"exposure_amount" numeric(14, 2),
	"subjectivities" text,
	"valid_until" date NOT NULL,
	"is_incumbent_renewal" boolean DEFAULT false NOT NULL,
	"is_bound" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"carrier" text NOT NULL,
	"sent_on" date,
	"responded_on" date,
	"status" "submission_status" DEFAULT 'planned' NOT NULL,
	"declined_reason" "decline_reason",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quotes_submission_idx" ON "quotes" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "quotes_workspace_idx" ON "quotes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "submissions_policy_idx" ON "submissions" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "submissions_account_idx" ON "submissions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "submissions_workspace_sent_idx" ON "submissions" USING btree ("workspace_id","sent_on");