-- v1.5.1 (1/2): mark the accounts the demo seed wrote. Rows created before
-- is_seed existed are matched by their fictional names (the ten current demo
-- accounts and the seven retired ones) and only when no user-uploaded document
-- hangs off them, so a user's own account can never be flagged as seed data.
UPDATE "accounts" a SET "is_seed" = true
WHERE a."name" IN (
  'Harbourline Foods Inc.', 'Cedar Ridge Mechanical Ltd.', 'Pacific Northwest Terminals Ltd.', 'Kootenay Alpine Resorts Inc.',
  'Fraser Valley Logistics Ltd.', 'Summit Ridge Builders Inc.', 'Coastline Dental Group', 'Harbourview Inns & Taverns Ltd.',
  'Bramblewood Garden Centres Ltd.', 'Northwind Engineering Partners Inc.',
  'Ashgrove Engineering Consultants Inc.', 'Kestrel Precision Components Corp.', 'Prairie Loop Logistics Inc.',
  'Bluewater Civil Contractors Inc.', 'Copperfield Home & Garden Ltd.', 'Maple & Mast Hospitality Group', 'Tidewater Accounting Partners LLP'
)
AND NOT EXISTS (SELECT 1 FROM "documents" d WHERE d."account_id" = a."id" AND d."is_seed" = false);--> statement-breakpoint
-- v1.5.1 (2/2): account names must be unique within a workspace and policy
-- numbers within an account (case-insensitive, trimmed). Existing duplicates are
-- renamed " (2)", " (3)" … in creation order and reported as notices before the
-- unique indexes are created in the next migration.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, workspace_id, name, row_number() OVER (PARTITION BY workspace_id, lower(trim(name)) ORDER BY created_at, id) AS rn
    FROM accounts
  LOOP
    IF r.rn > 1 THEN
      UPDATE accounts SET name = trim(name) || ' (' || r.rn || ')', updated_at = now() WHERE id = r.id;
      RAISE NOTICE 'Renamed duplicate account % in workspace % to "% (%)"', r.id, r.workspace_id, trim(r.name), r.rn;
    END IF;
  END LOOP;
  FOR r IN
    SELECT id, account_id, policy_number, row_number() OVER (PARTITION BY account_id, lower(trim(policy_number)) ORDER BY created_at, id) AS rn
    FROM policies WHERE policy_number IS NOT NULL
  LOOP
    IF r.rn > 1 THEN
      UPDATE policies SET policy_number = trim(policy_number) || ' (' || r.rn || ')', updated_at = now() WHERE id = r.id;
      RAISE NOTICE 'Renamed duplicate policy number % on account % to "% (%)"', r.id, r.account_id, trim(r.policy_number), r.rn;
    END IF;
  END LOOP;
END $$;
