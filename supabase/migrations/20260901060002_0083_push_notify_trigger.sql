-- ============================================================
-- 0083 — Push delivery: on any recipient-targeted notification insert,
-- fire-and-forget an HTTP call (via pg_net) to the send-push Edge
-- Function, which looks up that person's push_subscriptions and sends
-- the actual Web Push message. Failure here never blocks the caller's
-- transaction (e.g. signing a document) — it's async and best-effort.
-- ============================================================
create extension if not exists pg_net;

-- One-time: a shared secret so send-push can trust calls came from this
-- trigger and not a random request. Never exposed to the browser.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'push_webhook_secret') then
    perform vault.create_secret(
      gen_random_uuid()::text || gen_random_uuid()::text,
      'push_webhook_secret',
      'Shared secret between the notifications push trigger and the send-push Edge Function.'
    );
  end if;
end $$;

create or replace function public.notify_push_subscribers()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_secret is null then return new; end if;

  perform net.http_post(
    url := 'https://jbqjwyluurlvmgpvzksw.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
end;
$$;

create trigger trg_notify_push_subscribers
  after insert on public.notifications
  for each row when (new.recipient_id is not null)
  execute function public.notify_push_subscribers();
