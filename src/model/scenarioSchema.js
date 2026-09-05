import { z } from 'zod';

/**
 * Formal representation of a scenario question.
 *
 * All fields are always present because this structure is produced by an
 * LLM. Fields that do not apply to the selected scenario type use null.
 *
 * The LLM only identifies the scenario and extracts its parameters.
 * Deterministic code later decides whether the scenario can be calculated.
 */
export const ScenarioQuestionSchema = z.object({
  type: z.enum([
    'component_unavailable',
    'latency_degradation',
    'load_multiplication',
    'circuit_breaker_state_change',
    'unsupported'
  ]),

  // Service or data-store identifier affected by the scenario.
  componentId: z.string().min(1).nullable(),

  // Absolute latency requested by the question, expressed in milliseconds.
  newLatencyMs: z.number().positive().nullable(),

  // Relative latency change, such as "three times slower".
  latencyMultiplier: z.number().positive().nullable(),

  // Incoming-load change, such as "traffic increases by five times".
  loadMultiplier: z.number().positive().nullable(),

  // Source and target identify one circuit-breaker-protected dependency.
  circuitBreakerFrom: z.string().min(1).nullable(),
  circuitBreakerTo: z.string().min(1).nullable(),

  // Requested steady-state snapshot of the circuit breaker.
  circuitBreakerState: z.enum([
    'open',
    'half_open',
    'closed'
  ]).nullable(),

  // Explanation used when the question is outside the supported scenarios.
  unsupportedReason: z.string().min(1).nullable(),

  // Information required to interpret the question but absent from it.
  missingInformation: z.array(z.string()),

  // Any conservative interpretation made while translating the question.
  assumptions: z.array(z.string())
});
