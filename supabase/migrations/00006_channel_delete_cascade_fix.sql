
-- Allow channel deletion by setting channel_id to NULL in time_logs (preserve history)
-- and CASCADE delete user_presence (users get kicked out)
ALTER TABLE public.time_logs
  DROP CONSTRAINT IF EXISTS time_logs_channel_id_fkey;

ALTER TABLE public.time_logs
  ADD CONSTRAINT time_logs_channel_id_fkey
  FOREIGN KEY (channel_id) REFERENCES public.channels(id)
  ON DELETE SET NULL;

ALTER TABLE public.user_presence
  DROP CONSTRAINT IF EXISTS user_presence_channel_id_fkey;

ALTER TABLE public.user_presence
  ADD CONSTRAINT user_presence_channel_id_fkey
  FOREIGN KEY (channel_id) REFERENCES public.channels(id)
  ON DELETE CASCADE;
