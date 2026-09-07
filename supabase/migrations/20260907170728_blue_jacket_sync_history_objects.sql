create table public.blue_jacket_sync_history_objects (
  workspace_id uuid not null,
  object_key text not null,
  state text not null,
  claim_token uuid not null,
  payload_bytes bigint null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blue_jacket_sync_history_objects_pkey primary key (workspace_id, object_key),
  constraint blue_jacket_sync_history_objects_workspace_fkey
    foreign key (workspace_id)
    references public.blue_jacket_sync_workspaces(workspace_id)
    on delete cascade,
  constraint blue_jacket_sync_history_objects_object_key_check
    check (object_key ~ '^[0-9a-f]{64}$'),
  constraint blue_jacket_sync_history_objects_state_check
    check (state in ('PENDING', 'READY')),
  constraint blue_jacket_sync_history_objects_payload_bytes_check
    check (payload_bytes is null or payload_bytes >= 0),
  constraint blue_jacket_sync_history_objects_ready_payload_check
    check (state <> 'READY' or payload_bytes is not null)
);

alter table public.blue_jacket_sync_history_objects enable row level security;

revoke all on table public.blue_jacket_sync_history_objects from anon, authenticated;
grant select, insert, update, delete on table public.blue_jacket_sync_history_objects to service_role;

create policy "blue_jacket_sync_history_objects_deny_direct_access"
on public.blue_jacket_sync_history_objects
for all
to anon, authenticated
using (false)
with check (false);

comment on table public.blue_jacket_sync_history_objects is 'Opaque server-only arbitration metadata for immutable Blue Jacket canonical history objects.';
comment on column public.blue_jacket_sync_history_objects.object_key is 'Opaque 64-hex logical History object key; contains no business identity.';
comment on column public.blue_jacket_sync_history_objects.claim_token is 'Internal server claim owner token used only while arbitrating immutable History creation.';
comment on column public.blue_jacket_sync_history_objects.state is 'PENDING while the claim owner is creating/verifying Storage payload; READY only after durable Storage verification.';
