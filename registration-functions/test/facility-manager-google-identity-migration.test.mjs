import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(path.join(dir, "..", "sql", "20260826_facility_manager_google_identity_registry.sql"), "utf8");

test("manager Google identity migration is additive and enforces one graph per identity", () => {
  assert.match(migration, /BEGIN;/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.facility_manager_google_identity/)
  assert.match(migration, /google_identity_key varchar\(64\) PRIMARY KEY/)
  assert.match(migration, /UNIQUE \(org_id\)/)
  assert.match(migration, /UNIQUE \(registration_operation_id\)/)
  assert.match(migration, /UNIQUE \(registration_audit_id\)/)
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.facility_manager_google_identity TO portal_app;/)
  assert.doesNotMatch(migration, /^\s*GRANT\s+[^;]*\bDELETE\b/im)
  assert.match(migration, /COMMIT;/)
  assert.doesNotMatch(migration, /\bDROP\b|\bALTER TABLE\b/i)
})
