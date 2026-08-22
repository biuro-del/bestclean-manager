export function buildDashboardStopProposalAttentionAlert(pendingStopProposalCount = 0) {
  const count = Math.max(0, Math.trunc(Number(pendingStopProposalCount) || 0))
  if (count === 0) {
    return null
  }

  return {
    tone: 'warning',
    icon: 'ph-clock-countdown',
    title: `Godziny do weryfikacji (${count})`,
    meta: 'Propozycje STOP oczekują na decyzję biura',
    route: 'workdayStopProposals',
  }
}
