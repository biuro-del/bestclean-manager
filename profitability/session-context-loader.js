'use strict'

const {
  createProfitabilityAccessProfileRepository,
} = require('./access-profile-repository')
const {
  PROFITABILITY_ACCESS_PROFILE_MODES,
  isProfitabilityAccessProfileOrganizationAllowed,
  resolveProfitabilityAccessProfileRollout,
  resolveProfitabilityAccessProfileSessionMode,
} = require('../profitability-access-profile-rollout')
const {
  PROFITABILITY_FINANCIAL_MODEL_MODES,
  resolveProfitabilityFinancialModelRollout,
  resolveProfitabilityFinancialModelSessionMode,
} = require('../profitability-financial-model-rollout')

function text(value) {
  return String(value ?? '').trim()
}

async function databaseRelationExists(client, relationName) {
  const normalized = text(relationName)
  if (!normalized) return false
  const result = await client.query(
    'select to_regclass($1::text) as relation_name',
    [normalized],
  )
  return Boolean(text(result.rows?.[0]?.relation_name))
}

function blockedPatch() {
  return {
    profitability_access_profile_v2_blocked: true,
    profitability_financial_model_v21_blocked: true,
  }
}

function profilePatch(profile) {
  return {
    profitability_access_profile: {
      orgId: profile.org_id,
      uid: profile.uid,
      status: 'ACTIVE',
      operationalProfile: profile.operational_profile,
      objectScope: profile.object_scope,
      workerScope: profile.worker_scope,
      financeProfile: profile.finance_profile,
      accessMode: profile.access_mode,
      canEditOperationalCosts: profile.can_edit_operational_costs === true,
      canEditContractTerms: profile.can_edit_contract_terms === true,
      canEditProfitabilityTargets: profile.can_edit_profitability_targets === true,
      canViewWorkerRates: profile.can_view_worker_rates === true,
      canEditWorkerRates: profile.can_edit_worker_rates === true,
      validFrom: profile.valid_from,
      validUntil: profile.valid_to,
    },
    profitability_access_profile_v2_enabled: true,
  }
}

function legacyGrantPatch(rows = []) {
  const codes = new Set(rows.map((entry) => text(entry.permission_code)))
  const canEdit = codes.has('profitability:edit')
  const canRead = canEdit
    || codes.has('profitability:view-internal')
    || codes.has('profitability:view-client-summary')
    || codes.has('profitability:close-period')
  return {
    is_finance_admin: canEdit,
    profitability_grants: {
      profitabilityModule: canRead || canEdit ? { read: canRead, edit: canEdit } : false,
    },
  }
}

function createProfitabilitySessionContextLoader(options = {}) {
  const connectProfitabilityClient = options.connectProfitabilityClient
  const environment = options.environment ?? process.env
  const accessProfileRollout = resolveProfitabilityAccessProfileRollout(environment)
  const relationExists = options.relationExists ?? databaseRelationExists
  const requiredFinancialRelations = Object.freeze([
    ...(options.requiredFinancialRelations ?? []),
  ])
  const createAccessProfileRepository = options.createAccessProfileRepository
    ?? createProfitabilityAccessProfileRepository
  const resolveAccessProfileMode = options.resolveAccessProfileMode
    ?? ((client, organizationId) => resolveProfitabilityAccessProfileSessionMode({
      client,
      organizationId,
      policy: resolveProfitabilityAccessProfileRollout(environment),
      relationExists,
    }))
  const resolveFinancialModelMode = options.resolveFinancialModelMode
    ?? ((client, organizationId) => resolveProfitabilityFinancialModelSessionMode({
      client,
      organizationId,
      policy: resolveProfitabilityFinancialModelRollout(environment),
      relationExists,
    }))

  async function load({ uid, row }) {
    if (typeof connectProfitabilityClient !== 'function') return blockedPatch()

    const organizationId = text(row?.org_id)
    if (!isProfitabilityAccessProfileOrganizationAllowed(accessProfileRollout, organizationId)) {
      return blockedPatch()
    }

    let client = null
    try {
      client = await connectProfitabilityClient()
    } catch {
      return blockedPatch()
    }

    const patch = {}
    try {
      const normalizedUid = text(uid)
      const accessProfileMode = await resolveAccessProfileMode(client, organizationId)
      const financialModelMode = await resolveFinancialModelMode(client, organizationId)
      const accessProfileV2Enabled =
        accessProfileMode.mode === PROFITABILITY_ACCESS_PROFILE_MODES.V2
      let accessProfileV2Blocked =
        accessProfileMode.mode === PROFITABILITY_ACCESS_PROFILE_MODES.BLOCKED
      let financialModelV21Enabled =
        financialModelMode.mode === PROFITABILITY_FINANCIAL_MODEL_MODES.V21
      let financialModelV21Blocked =
        financialModelMode.mode === PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED

      if (financialModelV21Enabled) {
        try {
          for (const relation of requiredFinancialRelations) {
            if (!(await relationExists(client, relation))) {
              financialModelV21Blocked = true
              financialModelV21Enabled = false
              break
            }
          }
        } catch {
          financialModelV21Blocked = true
          financialModelV21Enabled = false
        }
      }

      if (accessProfileV2Enabled) {
        try {
          const readiness = await createAccessProfileRepository(client).schemaReady()
          if (readiness.ready !== true) {
            const error = new Error('Profitability access profile schema is not ready')
            error.code = 'PROFITABILITY_ACCESS_PROFILE_SCHEMA_NOT_READY'
            throw error
          }

          const profileResult = await client.query(
            `select org_id, uid, operational_profile, object_scope, worker_scope,
                    finance_profile, access_mode, can_edit_operational_costs,
                    can_edit_contract_terms, can_edit_profitability_targets,
                    can_view_worker_rates, can_edit_worker_rates,
                    valid_from, valid_to, revoked_at
               from public.organization_access_profile
              where org_id = $1::text
                and uid = $2::text
                and revoked_at is null
              order by valid_from desc, profile_id desc
              limit 2`,
            [organizationId, normalizedUid],
          )
          if (profileResult.rows.length === 1) {
            Object.assign(patch, profilePatch(profileResult.rows[0]))
          } else {
            patch.profitability_access_profile_v2_enabled = true
          }
        } catch {
          delete patch.profitability_access_profile_v2_enabled
          delete patch.profitability_access_profile
          accessProfileV2Blocked = true
        }
      } else if (!accessProfileV2Blocked) {
        try {
          if (await relationExists(client, 'public.profitability_permission')) {
            const permissionResult = await client.query(
              `select permission_code, object_id
                 from public.profitability_permission
                where org_id = $1::text
                  and uid = $2::text
                  and revoked_at is null`,
              [organizationId, normalizedUid],
            )
            Object.assign(patch, legacyGrantPatch(permissionResult.rows))
          }
        } catch {
          delete patch.is_finance_admin
          delete patch.profitability_grants
          accessProfileV2Blocked = true
        }
      }

      if (accessProfileV2Blocked) {
        patch.profitability_access_profile_v2_blocked = true
      }
      if (financialModelV21Enabled) {
        patch.profitability_financial_model_v21_enabled = true
      }
      if (financialModelV21Blocked) {
        patch.profitability_financial_model_v21_blocked = true
      }
      return patch
    } catch {
      return blockedPatch()
    } finally {
      client?.release?.()
    }
  }

  return Object.freeze({ load })
}

module.exports = {
  createProfitabilitySessionContextLoader,
}
