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
 * Describes a directed call from one component to another.
 */
export const DependencySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  callType: z.enum(['sync', 'async']),
  required: z.boolean(),
  timeoutMs: z.number().positive().nullable(),
  retryPolicy: RetryPolicySchema.nullable()
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