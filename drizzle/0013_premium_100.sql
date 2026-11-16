-- v1.5: insurers quote a premium as if they wrote the whole layer. Values already
-- entered were quoted that way, so the column is renamed without converting any
-- value. The actual premium (premium_100 × signed line ÷ 100) is computed in the
-- domain layer and never stored.
ALTER TABLE "layer_participations" RENAME COLUMN "premium" TO "premium_100";
