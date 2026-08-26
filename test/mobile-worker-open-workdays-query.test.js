const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const source = readFileSync(
  path.join(__dirname, '..', 'dataconnect', 'connectors', 'example', 'queries.gql'),
  'utf8',
)

function querySlice(name, nextName) {
  const start = source.indexOf(`query ${name}`)
  const end = source.indexOf(`query ${nextName}`, start + 1)
  assert.notEqual(start, -1, `Brak zapytania ${name}`)
  assert.notEqual(end, -1, `Brak granicy ${nextName}`)
  return source.slice(start, end)
}

test('otwarte dni pracownika maja osobny ograniczony kontrakt bez odczytu calej organizacji', () => {
  const query = querySlice(
    'WorkdaysPageForOrgByWorkerAndStatus',
    'WorkdaysPageForOrgByRoom',
  )

  for (const variable of [
    '$orgId',
    '$workerLogin',
    '$status',
    '$fromStartAt',
    '$toStartAt',
    '$limit',
    '$offset',
  ]) {
    assert.match(query, new RegExp(variable.replace('$', '\\$')))
  }
  assert.match(query, /orgId:\s*\{ eq:\s*\$orgId \}/)
  assert.match(query, /workerLogin:\s*\{ eq:\s*\$workerLogin \}/)
  assert.match(query, /status:\s*\{ eq:\s*\$status \}/)
  assert.match(query, /startAt:\s*\{ ge:\s*\$fromStartAt, le:\s*\$toStartAt \}/)
  assert.match(query, /limit:\s*\$limit/)
  assert.match(query, /offset:\s*\$offset/)
  assert.doesNotMatch(query, /limit:\s*5000/)
})
