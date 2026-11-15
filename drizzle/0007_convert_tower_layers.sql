-- v1.3: every v0.5 tower layer becomes one program layer in "Tower 1" with one
-- participation signed at 100% carrying its carrier and premium; every policy
-- with a deductible gets its default (all other perils) schedule row.
INSERT INTO "program_layers" ("id", "workspace_id", "account_id", "line_group", "tower_label", "layer_type", "attachment", "limit", "basis", "policy_id", "notes", "created_at", "updated_at")
SELECT "id", "workspace_id", "account_id", "line_group", 'Tower 1', "layer_type", "attachment", "limit", 'per_occurrence', "policy_id", NULL, "created_at", "updated_at"
FROM "tower_layers";--> statement-breakpoint
INSERT INTO "layer_participations" ("workspace_id", "layer_id", "insurer", "written_line_pct", "signed_line_pct", "premium", "policy_number", "is_lead", "notes", "created_at", "updated_at")
SELECT "workspace_id", "id", "carrier", NULL, 100, "premium", NULL, true, NULL, "created_at", "updated_at"
FROM "tower_layers";--> statement-breakpoint
INSERT INTO "policy_deductibles" ("workspace_id", "policy_id", "applies_to", "kind", "amount", "is_default")
SELECT "workspace_id", "id", 'All other perils', 'flat', "deductible", true
FROM "policies"
WHERE "deductible" IS NOT NULL;
