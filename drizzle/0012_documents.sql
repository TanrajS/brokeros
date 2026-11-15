CREATE TYPE "public"."document_status" AS ENUM('draft', 'final');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('proposal', 'submission', 'certificate', 'policy_document');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"policy_id" uuid,
	"doc_type" "document_type" NOT NULL,
	"title" text NOT NULL,
	"policy_year" text,
	"status" "document_status",
	"markets" text[] DEFAULT '{}'::text[] NOT NULL,
	"file_url" text NOT NULL,
	"file_pathname" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"notes" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_seed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_account_type_idx" ON "documents" USING btree ("account_id","doc_type");--> statement-breakpoint
CREATE INDEX "documents_policy_idx" ON "documents" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "documents_workspace_idx" ON "documents" USING btree ("workspace_id");