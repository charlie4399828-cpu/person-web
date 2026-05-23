-- 在 Supabase SQL Editor 中执行此脚本

create table if not exists public.card_data (
  id int primary key default 1,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

alter table public.card_data enable row level security;

-- 允许所有人读取（名片是公开的）
create policy "card_data_public_read"
  on public.card_data for select
  to anon, authenticated
  using (true);

-- 禁止前端直接写入（写入走 Edge Function）
revoke insert, update, delete on public.card_data from anon, authenticated;

insert into public.card_data (id, content)
values (1, '{}'::jsonb)
on conflict (id) do nothing;
