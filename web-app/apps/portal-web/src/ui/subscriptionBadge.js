const DAY_MS = 24 * 60 * 60 * 1000

const PLAN_LABELS = {
  TRIAL: 'Trial',
  START: 'Start',
  PRO: 'Pro',
}

function text(value) {
  return String(value ?? '').trim()
}

function remainingDayLabel(days) {
  if (days === 1) {
    return 'dzień'
  }
  return 'dni'
}

function subscriptionTone(remainingDays) {
  if (remainingDays === null) {
    return 'active'
  }
  if (remainingDays <= 0) {
    return 'expired'
  }
  if (remainingDays <= 3) {
    return 'critical'
  }
  if (remainingDays <= 7) {
    return 'warning'
  }
  return 'active'
}

export function renderSubscriptionBadge(session) {
  const chip = document.getElementById('subscriptionChip')
  if (!chip) {
    return
  }

  const planCode = text(session?.planCode).toUpperCase()
  const planName = PLAN_LABELS[planCode] || planCode
  if (!session || !planName) {
    chip.hidden = true
    return
  }

  const planNode = document.getElementById('subscriptionPlanName')
  const valueNode = document.getElementById('subscriptionRemainingValue')
  const labelNode = document.getElementById('subscriptionRemainingLabel')
  const rawEndDate = text(session.subscriptionEndsAt)
  const endDate = rawEndDate ? new Date(rawEndDate) : null
  const hasEndDate = Boolean(endDate && Number.isFinite(endDate.getTime()))
  const remainingDays = hasEndDate
    ? Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / DAY_MS))
    : null
  const dayLabel = remainingDays === null ? 'aktywny' : remainingDayLabel(remainingDays)

  if (planNode) {
    planNode.textContent = planName
  }
  if (valueNode) {
    valueNode.textContent = remainingDays === null ? '✓' : String(remainingDays)
  }
  if (labelNode) {
    labelNode.textContent = dayLabel
  }

  chip.dataset.tone = subscriptionTone(remainingDays)
  chip.hidden = false
  chip.setAttribute(
    'aria-label',
    remainingDays === null
      ? `Pakiet ${planName}, aktywny`
      : `Pakiet ${planName}, pozostało ${remainingDays} ${dayLabel}`,
  )
  chip.title = hasEndDate
    ? `Pakiet ${planName} • ważny do ${endDate.toLocaleDateString('pl-PL')}`
    : `Pakiet ${planName} • aktywny`
}
