CREATE TYPE "public"."claim_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"policy_id" uuid,
	"line_of_business" "line_of_business" NOT NULL,
	"claim_number" text NOT NULL,
	"date_of_loss" date NOT NULL,
	"date_reported" date NOT NULL,
	"description" text,
	"paid" numeric(14, 2) NOT NULL,
	"reserved" numeric(14, 2) NOT NULL,
	"status" "claim_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claims_account_line_idx" ON "claims" USING btree ("account_id","line_of_business");--> statement-breakpoint
CREATE INDEX "claims_account_number_idx" ON "claims" USING btree ("account_id","claim_number");--> statement-breakpoint
CREATE INDEX "claims_policy_idx" ON "claims" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "claims_workspace_idx" ON "claims" USING btree ("workspace_id");