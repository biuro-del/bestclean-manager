SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE pid <> pg_backend_pid()
  AND backend_type = 'client backend'
  AND usename IN (
    'portal_app',
    'service-1080573912983@gcp-sa-firebasedataconnect.iam'
  )
  AND state IN ('idle', 'idle in transaction');
