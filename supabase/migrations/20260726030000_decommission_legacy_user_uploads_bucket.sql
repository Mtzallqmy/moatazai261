begin;

-- `user-uploads` was superseded by the scoped `user-files` and
-- `chat-attachments` buckets. Revoke its client policies only when it contains
-- no stored, multipart, or vector-indexed data. Supabase deliberately blocks
-- direct SQL deletion of storage buckets; the remaining empty bucket record
-- must be removed through the authenticated Storage API.
do $$
declare
  legacy_bucket_exists boolean;
  legacy_bucket_has_data boolean;
begin
  select exists (
    select 1
    from storage.buckets
    where id = 'user-uploads'
  )
  into legacy_bucket_exists;

  if not legacy_bucket_exists then
    return;
  end if;

  perform 1
  from storage.buckets
  where id = 'user-uploads'
  for update;

  lock table storage.objects in share row exclusive mode;
  lock table storage.s3_multipart_uploads in share row exclusive mode;

  select
    exists (
      select 1
      from storage.objects
      where bucket_id = 'user-uploads'
    )
    or exists (
      select 1
      from storage.s3_multipart_uploads
      where bucket_id = 'user-uploads'
    )
    or exists (
      select 1
      from storage.vector_indexes
      where bucket_id = 'user-uploads'
    )
  into legacy_bucket_has_data;

  if legacy_bucket_has_data then
    raise notice
      'Preserving legacy bucket user-uploads because it still contains data';
    return;
  end if;

  drop policy if exists user_uploads_owner_read on storage.objects;
  drop policy if exists user_uploads_owner_insert on storage.objects;
  drop policy if exists user_uploads_owner_delete on storage.objects;
  drop policy if exists "user-uploads_owner_update" on storage.objects;

  raise notice
    'Legacy bucket user-uploads is empty and decommissioned; remove its bucket record through the Storage API';
end
$$;

commit;
