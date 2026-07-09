create table if not exists public.app_data (
  key text primary key,
  value jsonb not null,
  updated_at timestamp with time zone not null default now()
);

alter table public.app_data enable row level security;

insert into public.app_data (key, value)
values (
  'kurumlar',
  '{"ROOF-01":{"sifre":"123456","bitis":"2030-01-01","aktif":true}}'::jsonb
)
on conflict (key) do nothing;
