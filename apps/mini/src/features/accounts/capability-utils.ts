type CapabilitySnapshot = {
  capability: string
  status: string
  checked_at: string
}

const statusRank: Record<string, number> = {
  unavailable: 1,
  degraded: 2,
  available: 3,
}

// The API keeps one snapshot per adapter. The mini-program shows the
// effective capability once, preferring the healthiest adapter snapshot.
export function effectiveCapabilities<T extends CapabilitySnapshot>(items: T[]) {
  const byCapability = new Map<string, T>()
  items.forEach((item) => {
    const current = byCapability.get(item.capability)
    if (!current || isPreferred(item, current)) byCapability.set(item.capability, item)
  })
  return [...byCapability.values()]
}

function isPreferred(candidate: CapabilitySnapshot, current: CapabilitySnapshot) {
  const candidateRank = statusRank[candidate.status] ?? 0
  const currentRank = statusRank[current.status] ?? 0
  if (candidateRank !== currentRank) return candidateRank > currentRank
  return candidate.checked_at > current.checked_at
}
