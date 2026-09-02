import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeComponentUnavailable,
  analyzeLatencyDegradation,
  analyzeLoadMultiplication
} from '../src/engine/scenarioEngine.js';

/**
 * Checkout depends synchronously on Order Service.
 * Order Service depends synchronously on the database.
 * Notification Service uses the database asynchronously.
 */
const architectureModel = {
  modelVersion: '1.0',
  architectureName: 'Order Platform',
  services: [
    {
      id: 'checkout-api',
      name: 'Checkout API',
      replicas: 2,
      capacityRpsPerReplica: 100,
      baselineLatencyMs: 100
    },
    {
      id: 'order-service',
      name: 'Order Service',
      replicas: 2,
      capacityRpsPerReplica: 100,
      baselineLatencyMs: 150
    },
    {
      id: 'notification-service',
      name: 'Notification Service',
      replicas: 2,
      capacityRpsPerReplica: 100,
      baselineLatencyMs: 80
    }
  ],
  dataStores: [
    {
      id: 'orders-db',
      name: 'Orders Database',
      type: 'relational',
      replicas: 2,
      capacityRpsPerReplica: 200,
      baselineLatencyMs: 20
    }
  ],
  dependencies: [
    {
      from: 'checkout-api',
      to: 'order-service',
      callType: 'sync',
      required: true,
      timeoutMs: 1000,
      retryPolicy: {
        maxRetries: 0,
        backoff: 'none'
      }
    },
    {
      from: 'order-service',
      to: 'orders-db',
      callType: 'sync',
      required: true,
      timeoutMs: 500,
      retryPolicy: {
        maxRetries: 0,
        backoff: 'none'
      }
    },
    {
      from: 'notification-service',
      to: 'orders-db',
      callType: 'async',
      required: true,
      timeoutMs: null,
      retryPolicy: {
        maxRetries: 0,
        backoff: 'none'
      }
    }
  ],
  incomingLoadRps: 50,
  declaredTargets: {
    availabilityPercent: 99.9,
    maximumLatencyMs: null,
    minimumThroughputRps: null
  },
  assumptions: [],
  missingInformation: [],
  sourceEvidence: []
};

test('propagates unavailability through required synchronous dependencies', () => {
  const result = analyzeComponentUnavailable(
    architectureModel,
    'orders-db'
  );

  assert.equal(result.status, 'ANSWERED');

  assert.deepEqual(
    result.affectedComponents.sort(),
    ['checkout-api', 'order-service', 'orders-db'].sort()
  );

  assert.equal(
    result.affectedComponents.includes('notification-service'),
    false
  );
});

test('refuses an unavailable-component question for an unknown component', () => {
  const result = analyzeComponentUnavailable(
    architectureModel,
    'unknown-service'
  );

  assert.equal(result.status, 'NOT_ANSWERABLE');
  assert.ok(result.missingInformation.length > 0);
});

test('calculates timeout impact from degraded component latency', () => {
  const result = analyzeLatencyDegradation(
    architectureModel,
    'orders-db',
    800
  );

  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.scenarioLatencyMs, 800);
  assert.equal(result.dependencyResults.length, 1);
  assert.equal(result.dependencyResults[0].configuredTimeoutMs, 500);
  assert.equal(result.dependencyResults[0].timeoutOccurs, true);

  assert.deepEqual(
    result.affectedComponents.sort(),
    ['checkout-api', 'order-service', 'orders-db'].sort()
  );

  assert.equal(
    result.affectedComponents.includes('notification-service'),
    false
  );
});

test('propagates multiplied load and detects saturated components', () => {
  const result = analyzeLoadMultiplication(
    architectureModel,
    5
  );

  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.baselineIncomingLoadRps, 50);
  assert.equal(result.scenarioIncomingLoadRps, 250);

  const orderServiceResult = result.componentResults.find(
    (component) => component.componentId === 'order-service'
  );

  assert.equal(orderServiceResult.effectiveLoadRps, 250);
  assert.equal(orderServiceResult.totalCapacityRps, 200);
  assert.equal(orderServiceResult.utilizationPercent, 125);
  assert.equal(orderServiceResult.saturated, true);

  const databaseResult = result.componentResults.find(
    (component) => component.componentId === 'orders-db'
  );

  assert.equal(databaseResult.effectiveLoadRps, 500);
  assert.equal(databaseResult.totalCapacityRps, 400);
  assert.equal(databaseResult.utilizationPercent, 125);
  assert.equal(databaseResult.saturated, true);
});