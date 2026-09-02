import test from 'node:test';
import assert from 'node:assert/strict';

import { dispatchScenario } from '../src/engine/scenarioDispatcher.js';

/**
 * Small formal model used to test scenario selection.
 * No LLM or external service is involved in these tests.
 */
const architectureModel = {
  modelVersion: '1.0',
  architectureName: 'Dispatcher Example',
  services: [
    {
      id: 'api',
      name: 'API',
      replicas: 2,
      capacityRpsPerReplica: 100,
      baselineLatencyMs: 100
    },
    {
      id: 'orders',
      name: 'Orders',
      replicas: 2,
      capacityRpsPerReplica: 80,
      baselineLatencyMs: 200
    }
  ],
  dataStores: [],
  dependencies: [
    {
      from: 'api',
      to: 'orders',
      callType: 'sync',
      required: true,
      timeoutMs: 500,
      retryPolicy: null
    }
  ],
  incomingLoadRps: 50,
  declaredTargets: {
    availabilityPercent: null,
    maximumLatencyMs: null,
    minimumThroughputRps: null
  },
  assumptions: [],
  missingInformation: [],
  sourceEvidence: []
};

/**
 * Creates a complete scenario object while allowing each test to replace
 * only the fields relevant to that scenario.
 */
function createScenario(overrides = {}) {
  return {
    type: 'component_unavailable',
    componentId: null,
    newLatencyMs: null,
    latencyMultiplier: null,
    loadMultiplier: null,
    unsupportedReason: null,
    missingInformation: [],
    assumptions: [],
    ...overrides
  };
}

test('dispatches an unavailable-component scenario', () => {
  const scenario = createScenario({
    componentId: 'orders',
    assumptions: [
      'Orders refers to the orders component.'
    ]
  });

  const result = dispatchScenario(architectureModel, scenario);

  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.scenarioType, 'component_unavailable');
  assert.deepEqual(result.affectedComponents, ['orders', 'api']);
  assert.ok(
    result.assumptions.includes(
      'Orders refers to the orders component.'
    )
  );
});

test('calculates multiplied latency in code before dispatching', () => {
  const scenario = createScenario({
    type: 'latency_degradation',
    componentId: 'orders',
    latencyMultiplier: 3
  });

  const result = dispatchScenario(architectureModel, scenario);

  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.scenarioLatencyMs, 600);
  assert.equal(result.dependencyResults[0].timeoutOccurs, true);
  assert.deepEqual(result.affectedComponents, ['orders', 'api']);
});

test('refuses a latency multiplier without baseline latency', () => {
  const modelWithoutBaseline = {
    ...architectureModel,
    services: architectureModel.services.map((service) =>
      service.id === 'orders'
        ? {
            ...service,
            baselineLatencyMs: null
          }
        : service
    )
  };

  const scenario = createScenario({
    type: 'latency_degradation',
    componentId: 'orders',
    latencyMultiplier: 3
  });

  const result = dispatchScenario(
    modelWithoutBaseline,
    scenario
  );

  assert.equal(result.status, 'NOT_ANSWERABLE');
  assert.ok(
    result.missingInformation.includes(
      "baselineLatencyMs for 'orders'"
    )
  );
});

test('refuses a question outside the supported scenarios', () => {
  const scenario = createScenario({
    type: 'unsupported',
    unsupportedReason:
      'The model cannot evaluate a regional disaster.'
  });

  const result = dispatchScenario(architectureModel, scenario);

  assert.equal(result.status, 'NOT_ANSWERABLE');
  assert.equal(result.scenarioType, 'unsupported');
  assert.equal(
    result.reason,
    'The model cannot evaluate a regional disaster.'
  );
});