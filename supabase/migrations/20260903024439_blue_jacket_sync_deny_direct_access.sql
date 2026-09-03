create policy "blue_jacket_sync_deny_direct_access"
on public.blue_jacket_sync_workspaces
for all
to anon, authenticated
using (false)
with check (false);
