-- Enable Row Level Security on every table in the public schema as
-- defense-in-depth. The app connects via the "postgres" role (bypassrls),
-- so this does not affect Prisma. It blocks any accidental exposure if the
-- Supabase Data API (PostgREST) is ever turned on for these tables, since no
-- policies are granted to anon/authenticated here. Authorization is enforced
-- in application code, scoped by the Clerk-authenticated user's userId.

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "connected_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suggestions" ENABLE ROW LEVEL SECURITY;
