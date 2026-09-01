export function calculateTotalCapacity(replicas, capacityRpsPerReplica) {
  return replicas * capacityRpsPerReplica;
}

export function calculateAttempts(retries) {
  return 1 + retries;
}

export function calculateEffectiveLoad(incomingRps, attempts) {
  return incomingRps * attempts;
}

export function calculateUtilization(effectiveLoadRps, totalCapacityRps) {
  return (effectiveLoadRps / totalCapacityRps) * 100;
}

export function isSaturated(effectiveLoadRps, totalCapacityRps) {
  return effectiveLoadRps >= totalCapacityRps;
}

export function calculateMaximumOriginalLoad(totalCapacityRps, attempts) {
  return totalCapacityRps / attempts;
}

export function doesTimeoutOccur(scenarioLatencyMs, configuredTimeoutMs) {
  return scenarioLatencyMs > configuredTimeoutMs;
}