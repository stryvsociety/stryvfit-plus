create index if not exists admin_publish_records_published_client_idx
  on public.admin_publish_records (client_id, published_at desc)
  where status = 'published' and client_id is not null;

create index if not exists admin_publish_records_published_client_email_idx
  on public.admin_publish_records (client_email, published_at desc)
  where status = 'published' and client_email is not null;
