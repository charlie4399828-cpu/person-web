-- ============================================================
-- 访问统计迁移（已有 user_cards 表时，在 Supabase 执行本文件）
-- 必须按顺序整段执行，不要只复制视图部分！
-- ============================================================

-- ① 先在原表 user_cards 添加 view_count 列
alter table public.user_cards
  add column if not exists view_count integer not null default 0;

-- ② 访问设备记录表（同一设备同一名片只计 1 次）
create table if not exists public.card_view_devices (
  slug text not null references public.user_cards(slug) on delete cascade,
  device_id text not null,
  first_seen timestamptz not null default now(),
  primary key (slug, device_id)
);

create index if not exists card_view_devices_slug_idx on public.card_view_devices (slug);

revoke all on public.card_view_devices from anon, authenticated;

-- ③ 重建公开视图（必须先 drop，不能 create or replace 插入列）
drop view if exists public.cards_public;

create view public.cards_public as
  select
    slug,
    content,
    status,
    save_count,
    view_count,
    created_at,
    updated_at
  from public.user_cards;

grant select on public.cards_public to anon, authenticated;
