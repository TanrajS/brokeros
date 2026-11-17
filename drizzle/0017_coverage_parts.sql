-- v1.5.1: the deductible schedule becomes the coverage schedule. The table is
-- renamed with its data; each part gains an occurrence and an aggregate limit.
-- The default (all other perils) row takes the policy's headline limits, and a
-- policy that has headline limits but no deductible gets its default row now so
-- the limits have somewhere to live.
ALTER TABLE "policy_deductibles" RENAME TO "policy_coverage_parts";--> statement-breakpoint
ALTER INDEX "policy_deductibles_policy_idx" RENAME TO "policy_coverage_parts_policy_idx";--> statement-breakpoint
ALTER INDEX "policy_deductibles_workspace_idx" RENAME TO "policy_coverage_parts_workspace_idx";--> statement-breakpoint
ALTER INDEX "policy_deductibles_default_idx" RENAME TO "policy_coverage_parts_default_idx";--> statement-breakpoint
ALTER TABLE "policy_coverage_parts" RENAME CONSTRAINT "policy_deductibles_workspace_id_workspaces_id_fk" TO "policy_coverage_parts_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "policy_coverage_parts" RENAME CONSTRAINT "policy_deductibles_policy_id_policies_id_fk" TO "policy_coverage_parts_policy_id_policies_id_fk";--> statement-breakpoint
ALTER TABLE "policy_coverage_parts" ADD COLUMN "occurrence_limit" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "policy_coverage_parts" ADD COLUMN "aggregate_limit" numeric(14, 2);--> statement-breakpoint
UPDATE "policy_coverage_parts" c SET "occurrence_limit" = p."occurrence_limit", "aggregate_limit" = p."aggregate_limit"
FROM "policies" p WHERE p."id" = c."policy_id" AND c."is_default" = true;--> statement-breakpoint
INSERT INTO "policy_coverage_parts" ("workspace_id", "policy_id", "applies_to", "kind", "amount", "occurrence_limit", "aggregate_limit", "is_default")
SELECT p."workspace_id", p."id", 'All other perils', 'flat', NULL, p."occurrence_limit", p."aggregate_limit", true
FROM "policies" p
WHERE (p."occurrence_limit" IS NOT NULL OR p."aggregate_limit" IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM "policy_coverage_parts" c WHERE c."policy_id" = p."id" AND c."is_default" = true);
