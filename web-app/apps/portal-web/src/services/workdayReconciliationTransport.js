export function unwrapWorkdayReconciliationResponse(body = {}) {
  const candidate =
    body?.reconciliation ??
    body?.data?.reconciliation ??
    body?.payload?.reconciliation ??
    body?.data ??
    body?.payload
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {}
  const schemaReady = candidate.schemaReady ?? body?.schemaReady ?? body?.data?.schemaReady ?? body?.payload?.schemaReady
  return schemaReady === undefined ? candidate : { ...candidate, schemaReady: schemaReady !== false }
}
