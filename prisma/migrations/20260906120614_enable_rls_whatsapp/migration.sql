-- Enable Row Level Security on the WhatsApp tables, matching the same
-- defense-in-depth convention applied to every table that existed at
-- prisma/migrations/20260905184258_enable_rls (no policies are granted; the
-- app connects via the "postgres" role, which bypasses RLS — this only
-- blocks accidental exposure if the Supabase Data API is ever turned on).

ALTER TABLE "whatsapp_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_synced_chats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_messages" ENABLE ROW LEVEL SECURITY;
