/**
 * Deterministic calculation functions for the reasoning engine.
 *
 * The LLM may extract input values, but every quantitative result
 * returned by the application is calculated by the functions in this file.
 */

/**
 * Calculates the total capacity available across all replicas.
 */
export function calculateTotalCapacity(replicas, capacityRpsPerReplica) {
  return replicas * capacityRpsPerReplica;
}

/**
 * Calculates the maximum number of attempts for one request.
 * The initial attempt is included in addition to the configured retries.
 */
export function calculateAttempts(retries) {
  return 1 + retries;
}

/**
 * Calculates effective downstream load under the conservative assumption
 * that every retry reaches the same dependency.
 */
export function calculateEffectiveLoad(incomingRps, attempts) {
  return incomingRps * attempts;
}

/**
 * Calculates modeled utilization as a percentage of available capacity.
 * This value represents load versus capacity, not CPU utilization.
 */
export function calculateUtilization(effectiveLoadRps, totalCapacityRps) {
  return (effectiveLoadRps / totalCapacityRps) * 100;
}

/**
 * A component is considered saturated when its load reaches
 * or exceeds its total modeled capacity.
 */
export function isSaturated(effectiveLoadRps, totalCapacityRps) {
  return effectiveLoadRps >= totalCapacityRps;
}

/**
 * Calculates the maximum original incoming load that can be accepted
 * before retry amplification reaches the total capacity limit.
 */
export function calculateMaximumOriginalLoad(totalCapacityRps, attempts) {
  return totalCapacityRps / attempts;
}

/**
 * Determines whether the scenario latency exceeds the configured timeout.
 */
export function doesTimeoutOccur(scenarioLatencyMs, configuredTimeoutMs) {
  return scenarioLatencyMs > configuredTimeoutMs;
}