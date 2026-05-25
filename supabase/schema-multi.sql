-- 多用户名片：在 Supabase SQL Editor 中执行（保留原 card_data 表以兼容旧数据）

create table if not exists public.user_cards (
  slug text primary key,
  content jsonb not null default '{}'::jsonb,
  edit_password text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_cards_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{2,31}$')
);

alter table public.user_cards enable row level security;

-- 公开读取视图（不含 edit_password）
create or replace view public.cards_public as
  select slug, content, created_at, updated_at
  from public.user_cards;

grant select on public.cards_public to anon, authenticated;

revoke all on public.user_cards from anon, authenticated;

-- 可选：把原 card_data 第 1 行迁移为 default 名片（密码沿用 CARD_EDIT_PASSWORD）
-- insert into public.user_cards (slug, content, edit_password, updated_at)
-- select 'default', content, '763560', updated_at from public.card_data where id = 1
-- on conflict (slug) do update set content = excluded.content, updated_at = excluded.updated_at;
