import test from 'node:test';
import assert from 'node:assert/strict';

import { validateSemantics } from '../src/model/semanticValidator.js';

/**
 * This model is structurally valid JSON, but it contains several
 * architectural risks and missing values.
 */
const riskyModel = {
  modelVersion: '1.0',
  architectureName: 'Risky Example',
  services: [
    {
      id: 'api',
      name: 'API',
      replicas: 1,
      capacityRpsPerReplica: null,
      baselineLatencyMs: null
    }
  ],
  dataStores: [],
  dependencies: [
    {
      from: 'api',
      to: 'missing-service',
      callType: 'sync',
      required: true,
      timeoutMs: null,
      retryPolicy: {
        maxRetries: 2,
        backoff: 'none'
      }
    }
  ],
  incomingLoadRps: null,
  declaredTargets: {
    availabilityPercent: 99.9,
    maximumLatencyMs: null,
    minimumThroughputRps: null
  },
  assumptions: [],
  missingInformation: [],
  sourceEvidence: []
};

test('classifies semantic errors, warnings, and missing information', () => {
  const result = validateSemantics(riskyModel);

  const errorCodes = result.errors.map((issue) => issue.code);
  const warningCodes = result.warnings.map((issue) => issue.code);
  const missingCodes = result.missingInformation.map(
    (issue) => issue.code
  );

  assert.equal(result.isValid, false);

  assert.ok(errorCodes.includes('UNKNOWN_TARGET_COMPONENT'));

  assert.ok(warningCodes.includes('SINGLE_POINT_OF_FAILURE'));
  assert.ok(warningCodes.includes('RETRIES_WITHOUT_BACKOFF'));

  assert.ok(missingCodes.includes('MISSING_CAPACITY'));
  assert.ok(missingCodes.includes('MISSING_BASELINE_LATENCY'));
  assert.ok(missingCodes.includes('MISSING_SYNC_TIMEOUT'));
  assert.ok(missingCodes.includes('MISSING_INCOMING_LOAD'));
});

test('detects a cycle across synchronous dependencies', () => {
  const cycleModel = structuredClone(riskyModel);

  cycleModel.services = [
    {
      id: 'service-a',
      name: 'Service A',
      replicas: 2,
      capacityRpsPerReplica: 100,
      baselineLatencyMs: 100
    },
    {
      id: 'service-b',
      name: 'Service B',
      replicas: 2,
      capacityRpsPerReplica: 100,
      baselineLatencyMs: 100
    },
    {
      id: 'service-c',
      name: 'Service C',
      replicas: 2,
      capacityRpsPerReplica: 100,
      baselineLatencyMs: 100
    }
  ];

  cycleModel.dependencies = [
    {
      from: 'service-a',
      to: 'service-b',
      callType: 'sync',
      required: true,
      timeoutMs: 1000,
      retryPolicy: {
        maxRetries: 0,
        backoff: 'none'
      }
    },
    {
      from: 'service-b',
      to: 'service-c',
      callType: 'sync',
      required: true,
      timeoutMs: 1000,
      retryPolicy: {
        maxRetries: 0,
        backoff: 'none'
      }
    },
    {
      from: 'service-c',
      to: 'service-a',
      callType: 'sync',
      required: true,
      timeoutMs: 1000,
      retryPolicy: {
        maxRetries: 0,
        backoff: 'none'
      }
    }
  ];

  cycleModel.incomingLoadRps = 50;

  const result = validateSemantics(cycleModel);
  const errorCodes = result.errors.map((issue) => issue.code);

  assert.equal(result.isValid, false);
  assert.ok(errorCodes.includes('SYNCHRONOUS_CYCLE'));
});

function createCircuitBreakerModel() {
  return {
    modelVersion: '1.0',
    architectureName: 'Circuit Breaker Validation',
    services: [
      {
        id: 'message-queue',
        name: 'Message Queue',
        replicas: 2,
        capacityRpsPerReplica: 500,
        baselineLatencyMs: 10
      },
      {
        id: 'consumer',
        name: 'Consumer',
        replicas: 2,
        capacityRpsPerReplica: 100,
        baselineLatencyMs: 20
      },
      {
        id: 'downstream',
        name: 'Downstream Service',
        replicas: 2,
        capacityRpsPerReplica: 100,
        baselineLatencyMs: 80
      }
    ],
    dataStores: [],
    dependencies: [
      {
        from: 'consumer',
        to: 'downstream',
        callType: 'async',
        required: false,
        timeoutMs: null,
        retryPolicy: {
          maxRetries: 0,
          backoff: 'none'
        },
        circuitBreaker: {
          failureThreshold: 5,
          openDurationMs: 30000,
          halfOpenMaxCalls: 1,
          messageBufferComponentId: 'message-queue',
          openBehavior: 'retain_in_queue'
        }
      }
    ],
    incomingLoadRps: 20,
    declaredTargets: {
      availabilityPercent: null,
      maximumLatencyMs: null,
      minimumThroughputRps: null
    },
    assumptions: [],
    missingInformation: [],
    sourceEvidence: []
  };
}

test('accepts a queue-retaining circuit breaker on an async dependency', () => {
  const result = validateSemantics(createCircuitBreakerModel());

  assert.equal(result.isValid, true);
  assert.equal(result.errors.length, 0);
});

test('rejects a circuit breaker that references an unknown message buffer', () => {
  const model = createCircuitBreakerModel();
  model.dependencies[0].circuitBreaker.messageBufferComponentId =
    'unknown-queue';

  const result = validateSemantics(model);
  const errorCodes = result.errors.map((issue) => issue.code);

  assert.equal(result.isValid, false);
  assert.ok(errorCodes.includes('UNKNOWN_MESSAGE_BUFFER'));
});

test('rejects queue retention on a synchronous dependency', () => {
  const model = createCircuitBreakerModel();
  model.dependencies[0].callType = 'sync';
  model.dependencies[0].timeoutMs = 500;

  const result = validateSemantics(model);
  const errorCodes = result.errors.map((issue) => issue.code);

  assert.equal(result.isValid, false);
  assert.ok(
    errorCodes.includes('QUEUE_RETENTION_REQUIRES_ASYNC_DEPENDENCY')
  );
});

test('exposes missing half-open configuration without blocking open-state analysis', () => {
  const model = createCircuitBreakerModel();
  model.dependencies[0].circuitBreaker.halfOpenMaxCalls = null;

  const result = validateSemantics(model);
  const missingCodes = result.missingInformation.map(
    (issue) => issue.code
  );

  assert.equal(result.isValid, true);
  assert.ok(
    missingCodes.includes('MISSING_CIRCUIT_BREAKER_HALF_OPEN_LIMIT')
  );
});
