create table if not exists public.app_data (
  key text primary key,
  value jsonb not null,
  updated_at timestamp with time zone not null default now()
);

alter table public.app_data enable row level security;

-- Tüm kalıcı verilere yalnızca Render'daki sunucu erişir. Tarayıcılar hiçbir
-- zaman Supabase gizli anahtarını almaz ve app_data Data API üzerinden halka açılmaz.
revoke all on table public.app_data from anon, authenticated;
grant select, insert, update, delete on table public.app_data to service_role;

insert into public.app_data (key, value)
values (
  'kurumlar',
  '{"ROOF-01":{"sifre":"123456","bitis":"2030-01-01","aktif":true}}'::jsonb
)
on conflict (key) do nothing;
