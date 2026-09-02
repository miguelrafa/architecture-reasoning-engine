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