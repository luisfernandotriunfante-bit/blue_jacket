-- Removes the zero-business-data workspace used to validate the encrypted transport.
delete from public.blue_jacket_sync_workspaces
where workspace_id = 'b8255b4d-de95-4328-b585-fc32862e28c7';
