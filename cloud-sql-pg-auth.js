const CLOUD_SQL_IAM_PG_PASSWORD_PLACEHOLDER = 'cloud-sql-iam'

function resolvePgPassword({ useIamDatabaseAuth, password }) {
  // The Cloud SQL connector performs IAM authentication. pg still requires a
  // non-empty string while handling PostgreSQL SCRAM negotiation.
  if (useIamDatabaseAuth) {
    return CLOUD_SQL_IAM_PG_PASSWORD_PLACEHOLDER
  }

  return String(password ?? '')
}

module.exports = {
  CLOUD_SQL_IAM_PG_PASSWORD_PLACEHOLDER,
  resolvePgPassword,
}
