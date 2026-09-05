import { z } from 'zod';

/**
 * Structural schemas for the formal architecture model.
 *
 * Microsoft Foundry will extract this structure from free text.
 * Zod validates the structure before deterministic code uses it.
 * Nullable fields represent information that was not provided and
 * must never be silently invented.
 */

/**
 * Describes an application service and its measurable properties.
 */
export const ServiceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  replicas: z.number().int().positive().nullable(),
  capacityRpsPerReplica: z.number().positive().nullable(),
  baselineLatencyMs: z.number().nonnegative().nullable()
});

/**
 * Describes the retry behavior associated with a dependency.
 */
export const RetryPolicySchema = z.object({
  maxRetries: z.number().int().nonnegative(),
  backoff: z.enum(['none', 'fixed', 'exponential'])
});

/**
 * Describes a circuit breaker that protects message delivery from an
 * asynchronous consumer to a downstream component.
 *
 * Nullable values remain explicit when the description does not provide
 * enough information. The presence of this object means that the dependency
 * is circuit-breaker protected; a null value means that no breaker was
 * declared.
 */
export const CircuitBreakerSchema = z.object({
  failureThreshold: z.number().int().positive().nullable(),
  openDurationMs: z.number().positive().nullable(),
  halfOpenMaxCalls: z.number().int().positive().nullable(),
  messageBufferComponentId: z.string().min(1).nullable(),
  openBehavior: z.enum([
    'retain_in_queue',
    'dead_letter',
    'reject'
  ]).nullable()
});

/**
 * Describes a directed call from one component to another.
 */
export const DependencySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  callType: z.enum(['sync', 'async']),
  required: z.boolean(),
  timeoutMs: z.number().positive().nullable(),
  retryPolicy: RetryPolicySchema.nullable(),
  circuitBreaker: CircuitBreakerSchema.nullable()
});

/**
 * Describes a data store separately from application services.
 */
export const DataStoreSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum([
    'relational',
    'document',
    'key-value',
    'cache',
    'object-storage',
    'other'
  ]),
  replicas: z.number().int().positive().nullable(),
  capacityRpsPerReplica: z.number().positive().nullable(),
  baselineLatencyMs: z.number().nonnegative().nullable()
});

/**
 * Stores declared objectives. These are targets, not measured results.
 */
export const DeclaredTargetsSchema = z.object({
  availabilityPercent: z.number().min(0).max(100).nullable(),
  maximumLatencyMs: z.number().positive().nullable(),
  minimumThroughputRps: z.number().positive().nullable()
});

/**
 * Defines the complete versioned contract produced from the free-text
 * architecture description.
 */
export const ArchitectureModelSchema = z.object({
  modelVersion: z.literal('1.0'),
  architectureName: z.string().min(1),
  services: z.array(ServiceSchema).min(1),
  dataStores: z.array(DataStoreSchema),
  dependencies: z.array(DependencySchema),
  incomingLoadRps: z.number().positive().nullable(),
  declaredTargets: DeclaredTargetsSchema,
  assumptions: z.array(z.string()),
  missingInformation: z.array(z.string()),
  sourceEvidence: z.array(z.string())
});

/**
 * Normalizes models created before circuit-breaker support was introduced.
 * This keeps existing persisted model versions editable and reusable while
 * the strict Foundry output schema continues to require every field.
 */
export function parseArchitectureModel(model) {
  if (
    model === null ||
    typeof model !== 'object' ||
    !Array.isArray(model.dependencies)
  ) {
    return ArchitectureModelSchema.parse(model);
  }

  const normalizedModel = {
    ...model,
    dependencies: model.dependencies.map((dependency) => ({
      ...dependency,
      circuitBreaker: dependency.circuitBreaker ?? null
    }))
  };

  return ArchitectureModelSchema.parse(normalizedModel);
}
