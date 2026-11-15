-- v1.4: Workers Compensation leaves the line-of-business list. Its policies and
-- claims (demo data only) go first, so the enum can be rebuilt without them in
-- the following migration. Quote-derived retention options already carry their
-- premium in quote_options.premium, so dropping the quote link loses nothing.
DELETE FROM "claims" WHERE "line_of_business" = 'Workers Compensation';--> statement-breakpoint
DELETE FROM "policies" WHERE "line_of_business" = 'Workers Compensation';
