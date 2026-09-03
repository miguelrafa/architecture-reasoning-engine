import test from 'node:test';
import assert from 'node:assert/strict';

import { reasonAboutModel } from '../src/reasoningEngine.js';

/**
 * Creates a formal model that can be reused without architecture extraction.
 */
function createStoredModel() {
  return {
    modelVersion: '1.0',
    architectureName: 'Stored Model Example',
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
      availabilityPercent: 99.9,
      maximumLatencyMs: 600,
      minimumThroughputRps: 50
    },
    assumptions: [],
    missingInformation: [],
    sourceEvidence: [
      'The API synchronously calls Orders.'
    ]
  };
}

test(
  'reuses a stored model without repeating architecture extraction',
  async () => {
    let interpretedModel = null;
    let interpretedQuestion = null;

    const questionInterpreter = async (model, question) => {
      interpretedModel = model;
      interpretedQuestion = question;

      return {
        scenario: {
          type: 'component_unavailable',
          componentId: 'orders',
          newLatencyMs: null,
          latencyMultiplier: null,
          loadMultiplier: null,
          unsupportedReason: null,
          missingInformation: [],
          assumptions: [
            'Orders refers to the stored orders component.'
          ]
        },
        telemetry: {
          latencyMs: 5,
          inputTokens: 20,
          outputTokens: 10,
          totalTokens: 30
        }
      };
    };

    const model = createStoredModel();

    const result = await reasonAboutModel(
      model,
      'What happens if Orders becomes unavailable?',
      {
        questionInterpreter
      }
    );

    assert.equal(result.status, 'ANSWERED');
    assert.equal(interpretedModel, model);
    assert.equal(
      interpretedQuestion,
      'What happens if Orders becomes unavailable?'
    );

    assert.deepEqual(result.result.affectedComponents, [
      'orders',
      'api'
    ]);

    assert.equal(
      result.telemetry.calls.architectureExtraction,
      null
    );

    assert.equal(
      result.telemetry.calls.scenarioInterpretation.inputTokens,
      20
    );

    assert.equal(result.telemetry.totalInputTokens, 20);
    assert.equal(result.telemetry.totalOutputTokens, 10);
    assert.equal(result.telemetry.totalTokens, 30);
    assert.equal(result.telemetry.totalEstimatedCostUsd, 0.000024);
  }
);

test(
  'refuses an invalid stored model before question interpretation',
  async () => {
    let interpreterWasCalled = false;

    const questionInterpreter = async () => {
      interpreterWasCalled = true;

      throw new Error(
        'Invalid models must be rejected before Foundry is called.'
      );
    };

    const invalidModel = createStoredModel();

    invalidModel.dependencies.push({
      from: 'orders',
      to: 'unknown-component',
      callType: 'sync',
      required: true,
      timeoutMs: 500,
      retryPolicy: null
    });

    const result = await reasonAboutModel(
      invalidModel,
      'What happens if Orders becomes unavailable?',
      {
        questionInterpreter
      }
    );

    assert.equal(result.status, 'NOT_ANSWERABLE');
    assert.equal(result.modelValidation.isValid, false);
    assert.equal(interpreterWasCalled, false);

    assert.equal(result.telemetry.totalInputTokens, 0);
    assert.equal(result.telemetry.totalOutputTokens, 0);
    assert.equal(result.telemetry.totalTokens, 0);

    assert.equal(
      result.telemetry.calls.architectureExtraction,
      null
    );

    assert.equal(
      result.telemetry.calls.scenarioInterpretation,
      null
    );
  }
);