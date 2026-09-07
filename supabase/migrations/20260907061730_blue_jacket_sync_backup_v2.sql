alter table public.blue_jacket_sync_workspaces
  add column if not exists protocol_version smallint not null default 1,
  add column if not exists revision bigint not null default 0,
  add column if not exists current_object text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'blue_jacket_sync_workspaces_protocol_version_check'
      and conrelid = 'public.blue_jacket_sync_workspaces'::regclass
  ) then
    alter table public.blue_jacket_sync_workspaces
      add constraint blue_jacket_sync_workspaces_protocol_version_check
      check (protocol_version in (1, 2));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'blue_jacket_sync_workspaces_revision_check'
      and conrelid = 'public.blue_jacket_sync_workspaces'::regclass
  ) then
    alter table public.blue_jacket_sync_workspaces
      add constraint blue_jacket_sync_workspaces_revision_check
      check (revision >= 0);
  end if;
end
$$;

comment on column public.blue_jacket_sync_workspaces.protocol_version is 'Blue Jacket remote sync protocol version. 1=legacy current.bjs, 2=CAS current object + canonical history manifest.';
comment on column public.blue_jacket_sync_workspaces.revision is 'Monotonic server-side backup revision used for compare-and-swap.';
comment on column public.blue_jacket_sync_workspaces.current_object is 'Opaque Storage path of the authoritative versioned current snapshot for protocol v2.';
