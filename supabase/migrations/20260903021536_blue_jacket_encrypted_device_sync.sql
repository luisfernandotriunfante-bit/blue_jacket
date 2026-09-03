create table if not exists public.blue_jacket_sync_workspaces (
  workspace_id uuid primary key,
  key_hash text not null check (char_length(key_hash) = 64),
  payload_bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.blue_jacket_sync_workspaces enable row level security;
revoke all on table public.blue_jacket_sync_workspaces from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('blue-jacket-sync', 'blue-jacket-sync', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;
