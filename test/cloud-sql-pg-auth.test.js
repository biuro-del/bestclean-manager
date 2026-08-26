const test = require('node:test')
const assert = require('node:assert/strict')

const {
  CLOUD_SQL_IAM_PG_PASSWORD_PLACEHOLDER,
  resolvePgPassword,
} = require('../cloud-sql-pg-auth')

test('IAM Cloud SQL przekazuje pg techniczny, niepusty placeholder zamiast sekretu', () => {
  assert.equal(
    resolvePgPassword({ useIamDatabaseAuth: true, password: '' }),
    CLOUD_SQL_IAM_PG_PASSWORD_PLACEHOLDER,
  )
  assert.equal(typeof CLOUD_SQL_IAM_PG_PASSWORD_PLACEHOLDER, 'string')
  assert.notEqual(CLOUD_SQL_IAM_PG_PASSWORD_PLACEHOLDER, '')
})

test('logowanie has?owe zachowuje skonfigurowane has?o', () => {
  assert.equal(resolvePgPassword({ useIamDatabaseAuth: false, password: 'test-password' }), 'test-password')
})
