export function buildDashboardStopProposalAttentionAlert(hasPendingStopProposals = false) {
  if (hasPendingStopProposals !== true) {
    return null
  }

  return {
    tone: 'warning',
    icon: 'ph-clock-countdown',
    title: 'Godziny do weryfikacji',
    meta: 'Propozycje STOP oczekują na decyzję biura',
    route: 'workdayStopProposals',
  }
}
