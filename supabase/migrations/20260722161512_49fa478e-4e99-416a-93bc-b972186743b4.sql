
-- Chat channels
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_private boolean NOT NULL DEFAULT false,
  photo text,
  allowed_member_ids uuid[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_channels TO authenticated;
GRANT ALL ON public.chat_channels TO service_role;
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read channels" ON public.chat_channels
  FOR SELECT TO authenticated
  USING (
    is_private = false
    OR auth.uid() = ANY(allowed_member_ids)
    OR public.is_admin(auth.uid())
  );
CREATE POLICY "authenticated create channels" ON public.chat_channels
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update channels" ON public.chat_channels
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete channels" ON public.chat_channels
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER chat_channels_updated_at
  BEFORE UPDATE ON public.chat_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Chat messages
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  convo_id text NOT NULL,
  author_id uuid,
  author_name text NOT NULL,
  author_photo text,
  text text NOT NULL,
  mentions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);
CREATE INDEX IF NOT EXISTS chat_messages_convo_created_idx
  ON public.chat_messages(convo_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all messages (DMs are permissioned by convo_id containing their uid)
CREATE POLICY "authenticated read messages" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    convo_id NOT LIKE 'dm:%'
    OR position(auth.uid()::text in convo_id) > 0
  );
CREATE POLICY "authenticated insert own messages" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() OR author_id IS NULL);
CREATE POLICY "authenticated update own messages" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "authenticated delete own messages" ON public.chat_messages
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_admin(auth.uid()));

-- Chat reads (per user unread markers)
CREATE TABLE IF NOT EXISTS public.chat_reads (
  user_id uuid NOT NULL,
  convo_id text NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, convo_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_reads TO authenticated;
GRANT ALL ON public.chat_reads TO service_role;
ALTER TABLE public.chat_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user manage own reads" ON public.chat_reads
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Chat presence/status
CREATE TABLE IF NOT EXISTS public.chat_status (
  user_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'online',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_status TO authenticated;
GRANT ALL ON public.chat_status TO service_role;
ALTER TABLE public.chat_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read status" ON public.chat_status
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "user upsert own status" ON public.chat_status
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user update own status" ON public.chat_status
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_status;

-- Seed default channels once
INSERT INTO public.chat_channels (name, sort_order)
SELECT 'geral', 0
WHERE NOT EXISTS (SELECT 1 FROM public.chat_channels);
INSERT INTO public.chat_channels (name, sort_order)
SELECT 'aleatório', 1
WHERE NOT EXISTS (SELECT 1 FROM public.chat_channels WHERE name = 'aleatório');
