'use strict'

const {
  isAllowedPlatformOperation,
  isSensitivePlatformOperation,
  sanitizeTenantMutationVariables,
} = require('./platform-policy')
const platformRepository = require('./platform-repository')
const { getPlatformRequestContext } = require('./platform-request-context')
const { requestEmailChallenge, verifyEmailChallenge } = require('./platform-email-mfa')

const MAX_BODY_BYTES = 1024 * 1024

function text(value) {
  return String(value ?? '').trim()
}

function normalizeOrgId(value) {
  const orgId = text(value)
  return /^[a-z0-9_-]{1,64}$/i.test(orgId) ? orgId : ''
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(JSON.stringify(payload))
}

function apiError(res, error) {
  const status = Number(error?.statusCode || error?.status || 500)
  json(res, Number.isFinite(status) ? status : 500, {
    ok: false,
    error: {
      code: text(error?.publicCode || error?.code) || 'PLATFORM_API_ERROR',
      message: text(error?.publicMessage || error?.message) || 'Nie udało się obsłużyć operacji platformowej.',
      ...(error?.details === undefined ? {} : { details: error.details }),
    },
  })
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) {
      throw platformRepository.publicError(413, 'REQUEST_TOO_LARGE', 'Żądanie jest zbyt duże.')
    }
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw platformRepository.publicError(400, 'INVALID_JSON', 'Niepoprawny JSON w żądaniu.')
  }
}

function bearerToken(req) {
  const match = /^Bearer\s+(.+)$/i.exec(text(req?.headers?.authorization))
  return text(match?.[1])
}

function createPlatformApi(dependencies) {
  const {
    connectDbClient,
    executeAdminDataConnectOperation,
    verifyFirebaseIdToken,
  } = dependencies

  async function authenticate(req, client, options = {}) {
    const token = bearerToken(req)
    if (!token) throw platformRepository.publicError(401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    const decodedToken = await verifyFirebaseIdToken(token)
    const principal = await platformRepository.assertPlatformPrincipal(client, decodedToken, options)
    return { decodedToken, principal }
  }

  async function requireContext(client, principal, orgId = '') {
    const request = getPlatformRequestContext()
    const contextId = text(request?.platformContextId)
    if (!contextId) {
      throw platformRepository.publicError(403, 'PLATFORM_CONTEXT_REQUIRED', 'Brak aktywnego kontekstu organizacji platformy.')
    }
    const context = await platformRepository.getActiveAccessContext(client, {
      uid: principal.uid,
      orgId,
      contextId,
    })
    if (!context) {
      throw platformRepository.publicError(403, 'PLATFORM_CONTEXT_INVALID', 'Kontekst organizacji jest zamknięty albo nie odpowiada żądaniu.')
    }
    return context
  }

  async function appendPhase(client, phase, principal, context, operation, target, payload, result) {
    const request = getPlatformRequestContext() || {}
    return platformRepository.appendAudit(client, {
      requestId: request.requestId,
      phase,
      principal,
      contextId: text(context?.context_id || context?.contextId),
      orgId: text(context?.org_id || context?.activeOrgId),
      operation,
      target,
      payload,
      result,
      request,
    })
  }

  async function auditedMutation(client, { principal, context, operation, target, payload, action }) {
    await appendPhase(client, 'REQUESTED', principal, context, operation, target, payload, null)
    try {
      const result = await action()
      await appendPhase(client, 'SUCCEEDED', principal, context, operation, target, null, result)
      return result
    } catch (error) {
      await appendPhase(client, 'FAILED', principal, context, operation, target, null, {
        code: text(error?.publicCode || error?.code),
        message: text(error?.publicMessage || error?.message),
      }).catch((auditError) => {
        console.error('[platform-audit] failed to append FAILED phase', auditError)
      })
      throw error
    }
  }

  async function handle(req, res, requestUrl) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return true
    }

    const pathname = requestUrl.pathname
    if (!pathname.startsWith('/api/platform/')) return false
    let client = null
    try {
      client = await connectDbClient()
      await platformRepository.assertPlatformSchemaReady(client)
      const method = text(req.method).toUpperCase()

      if (pathname === '/api/platform/dashboard' && method === 'GET') {
        await authenticate(req, client)
        const data = await platformRepository.getPlatformDashboard(client)
        json(res, 200, { ok: true, data })
        return true
      }

      if (pathname === '/api/platform/plans' && method === 'GET') {
        await authenticate(req, client)
        const data = await platformRepository.listPlans(client)
        json(res, 200, { ok: true, data: { items: data } })
        return true
      }

      if (pathname === '/api/platform/mfa/email/request' && method === 'POST') {
        const { principal } = await authenticate(req, client, { requireMfa: false })
        const body = await readJson(req)
        const result = await auditedMutation(client, {
          principal,
          context: null,
          operation: 'PLATFORM_EMAIL_MFA_REQUEST',
          target: 'platform-authentication',
          payload: { email: body?.email },
          action: () => requestEmailChallenge(client, {
            principal,
            email: body?.email,
            request: getPlatformRequestContext(),
          }),
        })
        json(res, 200, { ok: true, data: result })
        return true
      }

      if (pathname === '/api/platform/mfa/email/verify' && method === 'POST') {
        const { principal } = await authenticate(req, client, { requireMfa: false })
        const body = await readJson(req)
        const result = await auditedMutation(client, {
          principal,
          context: null,
          operation: 'PLATFORM_EMAIL_MFA_VERIFY',
          target: 'platform-authentication',
          payload: { challengeId: body?.challengeId },
          action: () => verifyEmailChallenge(client, {
            principal,
            challengeId: body?.challengeId,
            code: body?.code,
            request: getPlatformRequestContext(),
          }),
        })
        json(res, 200, { ok: true, data: result })
        return true
      }

      if (pathname === '/api/platform/organizations' && method === 'GET') {
        const { principal } = await authenticate(req, client)
        const data = await platformRepository.listOrganizations(client, {
          search: requestUrl.searchParams.get('search'),
          status: requestUrl.searchParams.get('status'),
          onboardingStatus: requestUrl.searchParams.get('onboardingStatus'),
          planCode: requestUrl.searchParams.get('planCode'),
          subscriptionStatus: requestUrl.searchParams.get('subscriptionStatus'),
          deletion: requestUrl.searchParams.get('deletion'),
          endingWithinDays: requestUrl.searchParams.get('endingWithinDays'),
          sortBy: requestUrl.searchParams.get('sortBy'),
          sortDirection: requestUrl.searchParams.get('sortDirection'),
          page: requestUrl.searchParams.get('page'),
          pageSize: requestUrl.searchParams.get('pageSize'),
        })
        json(res, 200, { ok: true, data, actor: { uid: principal.uid, role: principal.role } })
        return true
      }

      if (pathname === '/api/platform/access-context' && method === 'POST') {
        const { principal } = await authenticate(req, client)
        const body = await readJson(req)
        const orgId = normalizeOrgId(body?.orgId)
        if (!orgId) throw platformRepository.publicError(400, 'INVALID_ORG_ID', 'Brak poprawnego orgId.')
        const pendingContext = { activeOrgId: orgId, contextId: '' }
        const context = await auditedMutation(client, {
          principal,
          context: pendingContext,
          operation: 'OPEN_ORGANIZATION_CONTEXT',
          target: `organization:${orgId}`,
          payload: { reason: body?.reason },
          action: () => platformRepository.openAccessContext(client, {
            principal,
            orgId,
            reason: body?.reason,
            request: getPlatformRequestContext(),
          }),
        })
        json(res, 200, {
          ok: true,
          data: {
            status: 'READY',
            context: {
              uid: principal.uid,
              actorType: 'PLATFORM',
              activeOrgId: context.activeOrgId,
              organizationName: context.organizationName,
              organizationStatus: context.organizationStatus,
              organizationDeletedAt: context.organizationDeletedAt,
              workerId: '',
              role: principal.role,
              roleCode: principal.role,
              roleLevel: 4,
              planCode: context.planCode,
              subscriptionStatus: context.subscriptionStatus,
              subscriptionEndsAt: context.subscriptionEndsAt || null,
              platformContextId: context.contextId,
              platformReason: context.reason,
            },
          },
        })
        return true
      }

      if (pathname === '/api/platform/access-context/close' && method === 'POST') {
        const { principal } = await authenticate(req, client)
        const request = getPlatformRequestContext() || {}
        const context = await requireContext(client, principal)
        const result = await auditedMutation(client, {
          principal,
          context,
          operation: 'CLOSE_ORGANIZATION_CONTEXT',
          target: `organization:${context.org_id}`,
          payload: null,
          action: () => platformRepository.closeAccessContext(client, {
            uid: principal.uid,
            contextId: request.platformContextId,
          }),
        })
        json(res, 200, { ok: true, data: { closed: Boolean(result), context: result } })
        return true
      }

      if (pathname === '/api/platform/data-connect' && method === 'POST') {
        const { principal, decodedToken } = await authenticate(req, client)
        const body = await readJson(req)
        const kind = text(body?.kind).toLowerCase()
        const operationName = text(body?.operationName)
        if (!isAllowedPlatformOperation(kind, operationName)) {
          throw platformRepository.publicError(403, 'PLATFORM_OPERATION_NOT_ALLOWED', 'Ta operacja nie znajduje się na allowliście platformy.')
        }
        const rawVariables = body?.variables && typeof body.variables === 'object' ? body.variables : {}
        const orgId = normalizeOrgId(rawVariables.orgId)
        if (!orgId) throw platformRepository.publicError(400, 'INVALID_ORG_ID', 'Operacja platformowa wymaga poprawnego variables.orgId.')
        const context = await requireContext(client, principal, orgId)
        if (isSensitivePlatformOperation(operationName, pathname) && !platformRepository.hasFreshPlatformAuthentication(decodedToken, principal)) {
          throw platformRepository.publicError(403, 'PLATFORM_REAUTH_REQUIRED', 'Ta operacja wymaga ponownego logowania z MFA w ciągu ostatnich 5 minut.')
        }
        const variables = kind === 'mutation'
          ? await platformRepository.preserveTenantMutationAuthors(
              client,
              operationName,
              sanitizeTenantMutationVariables(rawVariables),
            )
          : rawVariables
        const operationOptions = await platformRepository.getDataConnectOperationOptions(client, {
          orgId,
          kind,
        })
        const execute = () => executeAdminDataConnectOperation(kind, operationName, variables, operationOptions)
        const result = kind === 'mutation'
          ? await auditedMutation(client, {
              principal,
              context,
              operation: `DATACONNECT_${operationName}`,
              target: `organization:${orgId}`,
              payload: variables,
              action: execute,
            })
          : await execute()
        json(res, 200, { ok: true, data: result })
        return true
      }

      if (pathname === '/api/platform/audit' && method === 'GET') {
        await authenticate(req, client)
        const data = await platformRepository.listAudit(client, {
          orgId: requestUrl.searchParams.get('orgId'),
          adminUid: requestUrl.searchParams.get('adminUid'),
          operation: requestUrl.searchParams.get('operation'),
          limit: requestUrl.searchParams.get('limit'),
        })
        json(res, 200, { ok: true, data: { items: data } })
        return true
      }

      const platformDetailsMatch = /^\/api\/platform\/organizations\/([a-z0-9_-]{1,64})(?:\/(subscription-history|transactions|documents|operations(?:\/preview)?))?$/i.exec(pathname)
      if (platformDetailsMatch) {
        const orgId = normalizeOrgId(platformDetailsMatch[1])
        const resource = text(platformDetailsMatch[2]).toLowerCase()
        const { principal, decodedToken } = await authenticate(req, client)
        const context = await requireContext(client, principal, orgId)

        if (!resource && method === 'GET') {
          const data = await platformRepository.getOrganizationDetails(client, orgId)
          json(res, 200, { ok: true, data })
          return true
        }
        if (resource === 'subscription-history' && method === 'GET') {
          const data = await platformRepository.listSubscriptionHistory(client, orgId, {
            page: requestUrl.searchParams.get('page'),
            pageSize: requestUrl.searchParams.get('pageSize'),
          })
          json(res, 200, { ok: true, data })
          return true
        }
        if (resource === 'transactions' && method === 'GET') {
          const data = await platformRepository.listBillingTransactions(client, orgId, {
            page: requestUrl.searchParams.get('page'),
            pageSize: requestUrl.searchParams.get('pageSize'),
          })
          json(res, 200, { ok: true, data })
          return true
        }
        if (resource === 'documents' && method === 'GET') {
          const data = await platformRepository.listBillingDocuments(client, orgId, {
            page: requestUrl.searchParams.get('page'),
            pageSize: requestUrl.searchParams.get('pageSize'),
          })
          json(res, 200, { ok: true, data })
          return true
        }
        if (resource === 'operations/preview' && method === 'POST') {
          const body = await readJson(req)
          const data = await platformRepository.previewPlatformOperation(client, {
            orgId,
            operation: body?.operation,
            reason: body?.reason,
            payload: body?.payload,
          })
          json(res, 200, { ok: true, data })
          return true
        }
        if (resource === 'operations' && method === 'POST') {
          if (!platformRepository.hasFreshPlatformAuthentication(decodedToken, principal)) {
            throw platformRepository.publicError(
              403,
              'PLATFORM_REAUTH_REQUIRED',
              'Ta operacja wymaga ponownego logowania z MFA w ciągu ostatnich 5 minut.',
            )
          }
          const body = await readJson(req)
          const operation = text(body?.operation).toUpperCase()
          const target = `organization:${orgId}`
          await appendPhase(client, 'REQUESTED', principal, context, operation, target, {
            reason: body?.reason,
            payload: body?.payload,
            expectedVersion: body?.expectedVersion,
          }, null)
          try {
            const request = getPlatformRequestContext() || {}
            const data = await platformRepository.executePlatformOperation(client, {
              orgId,
              operation,
              reason: body?.reason,
              payload: body?.payload,
              expectedVersion: body?.expectedVersion,
              principal,
              requestId: request.requestId,
              appendSucceeded: (result) => appendPhase(
                client,
                'SUCCEEDED',
                principal,
                context,
                operation,
                target,
                null,
                result,
              ),
            })
            json(res, 200, { ok: true, data })
            return true
          } catch (error) {
            await appendPhase(client, 'FAILED', principal, context, operation, target, null, {
              code: text(error?.publicCode || error?.code),
              message: text(error?.publicMessage || error?.message),
            }).catch((auditError) => {
              console.error('[platform-audit] failed to append FAILED phase', auditError)
            })
            throw error
          }
        }
      }

      const organizationMatch = /^\/api\/platform\/organizations\/([a-z0-9_-]{1,64})(?:\/(subscription|owner|soft-delete|restore))?$/i.exec(pathname)
      if (organizationMatch) {
        const orgId = normalizeOrgId(organizationMatch[1])
        const actionName = text(organizationMatch[2]).toLowerCase()
        const allowed = (!actionName && method === 'PATCH') || (actionName && method === 'POST')
        if (!allowed) throw platformRepository.publicError(405, 'METHOD_NOT_ALLOWED', 'Niedozwolona metoda dla operacji organizacji.')
        const { principal, decodedToken } = await authenticate(req, client)
        const context = await requireContext(client, principal, orgId)
        if ((actionName || method === 'PATCH') && !platformRepository.hasFreshPlatformAuthentication(decodedToken, principal)) {
          throw platformRepository.publicError(403, 'PLATFORM_REAUTH_REQUIRED', 'Zmiana organizacji wymaga ponownego logowania z MFA w ciągu ostatnich 5 minut.')
        }
        const body = await readJson(req)
        const operation = actionName ? `ORGANIZATION_${actionName.toUpperCase().replace('-', '_')}` : 'ORGANIZATION_UPDATE'
        const result = await auditedMutation(client, {
          principal,
          context,
          operation,
          target: `organization:${orgId}`,
          payload: body,
          action: () => {
            if (!actionName) return platformRepository.updateOrganization(client, orgId, body)
            if (actionName === 'subscription') return platformRepository.updateSubscription(client, orgId, body)
            if (actionName === 'owner') return platformRepository.transferOrganizationOwner(client, orgId, body?.newOwnerWorkerId)
            if (actionName === 'soft-delete') return platformRepository.setOrganizationDeleted(client, orgId, true)
            if (actionName === 'restore') return platformRepository.setOrganizationDeleted(client, orgId, false)
            throw platformRepository.publicError(404, 'PLATFORM_ROUTE_NOT_FOUND', 'Nieznana operacja organizacji.')
          },
        })
        json(res, 200, { ok: true, data: result })
        return true
      }

      throw platformRepository.publicError(404, 'PLATFORM_ROUTE_NOT_FOUND', 'Nie znaleziono endpointu platformowego.')
    } catch (error) {
      apiError(res, error)
      return true
    } finally {
      client?.release?.()
    }
  }

  return { handle }
}

module.exports = { createPlatformApi }
