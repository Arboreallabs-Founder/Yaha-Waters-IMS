-- ============================================================
-- 0081 — Web Push: subscription storage + a recipient on notifications
-- ============================================================

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index idx_push_subscriptions_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
create policy push_sub_sel on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_sub_ins on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy push_sub_del on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.push_subscriptions to authenticated;

-- Purely additive — every existing notifications insert leaves this null,
-- meaning "broadcast to admin/team_lead" exactly as today. A non-null value
-- means "this specific person should be pushed a notification."
alter table public.notifications add column recipient_id uuid references public.profiles(id);
create index idx_notifications_recipient on public.notifications(recipient_id);
