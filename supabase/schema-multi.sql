-- 多用户名片：在 Supabase SQL Editor 中执行（可重复执行）
-- 保留原 card_data 表以兼容旧数据

create table if not exists public.user_cards (
  slug text primary key,
  content jsonb not null default '{}'::jsonb,
  edit_password text not null,
  status text not null default 'active' check (status in ('draft', 'active')),
  save_count int not null default 0,
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_cards_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{2,31}$')
);

-- 若已建表，追加新字段（可重复执行）
alter table public.user_cards add column if not exists status text not null default 'active';
alter table public.user_cards add column if not exists save_count int not null default 0;
alter table public.user_cards add column if not exists view_count int not null default 0;

-- 按设备去重的访问记录（同一设备同一名片只计 1 次）
create table if not exists public.card_view_devices (
  slug text not null references public.user_cards(slug) on delete cascade,
  device_id text not null,
  first_seen timestamptz not null default now(),
  primary key (slug, device_id)
);

create index if not exists card_view_devices_slug_idx on public.card_view_devices (slug);

alter table public.user_cards enable row level security;

-- 创建频率限制日志（防刷）
create table if not exists public.card_create_log (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists card_create_log_ip_time on public.card_create_log (ip, created_at desc);

-- 公开读取视图（不含 edit_password）
-- 注意：已有 cards_public 时不能用 create or replace 在中间插入列，必须先 drop
drop view if exists public.cards_public;

create view public.cards_public as
  select slug, content, status, save_count, view_count, created_at, updated_at
  from public.user_cards;

grant select on public.cards_public to anon, authenticated;

revoke all on public.user_cards from anon, authenticated;
revoke all on public.card_create_log from anon, authenticated;
revoke all on public.card_view_devices from anon, authenticated;

-- 可选：把原 card_data 第 1 行迁移为 default 名片（密码沿用 CARD_EDIT_PASSWORD）
-- insert into public.user_cards (slug, content, edit_password, updated_at)
-- select 'default', content, '763560', updated_at from public.card_data where id = 1
-- on conflict (slug) do update set content = excluded.content, updated_at = excluded.updated_at;

-- 可选：定期清理创建日志（7 天前）
-- delete from public.card_create_log where created_at < now() - interval '7 days';
