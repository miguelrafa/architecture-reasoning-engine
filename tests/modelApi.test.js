import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/server.js';
import { createModelRepository } from '../src/storage/modelRepository.js';

/**
 * Returns a structurally valid model for API persistence tests.
 */
function createValidModel() {
  return {
    modelVersion: '1.0',
    architectureName: 'Model API Example',
    services: [
      {
        id: 'api',
        name: 'API',
        replicas: 2,
        capacityRpsPerReplica: 100,
        baselineLatencyMs: 100
      }
    ],
    dataStores: [],
    dependencies: [],
    incomingLoadRps: 50,
    declaredTargets: {
      availabilityPercent: 99.9,
      maximumLatencyMs: 500,
      minimumThroughputRps: 50
    },
    assumptions: [],
    missingInformation: [],
    sourceEvidence: [
      'The API has two replicas.'
    ]
  };
}

/**
 * Starts an isolated API and JSON repository for each test.
 */
async function startModelApi(
  context,
  {
    storedModelReasoningFunction = async () => {
      throw new Error(
        'This test must not call the stored-model reasoning workflow.'
      );
    }
  } = {}
) {
  const directory = await mkdtemp(
    join(tmpdir(), 'architecture-model-api-')
  );

  const repository = createModelRepository({
    storagePath: join(directory, 'models.json')
  });

  const reasoningFunction = async () => {
    throw new Error(
      'Model persistence tests must not call the full reasoning workflow.'
    );
  };

  const app = createApp({
    reasoningFunction,
    storedModelReasoningFunction,
    modelRepository: repository
  });

  const server = app.listen(0);
  await once(server, 'listening');

  context.after(
    () =>
      new Promise((resolve, reject) => {
        server.close(async (error) => {
          if (error) {
            reject(error);
            return;
          }

          await rm(directory, {
            recursive: true,
            force: true
          });

          resolve();
        });
      })
  );

  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

test('creates, lists, edits, and retrieves model versions', async (context) => {
  const { baseUrl } = await startModelApi(context);
  const originalModel = createValidModel();

  const createResponse = await fetch(`${baseUrl}/api/models`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: originalModel
    })
  });

  const created = await createResponse.json();

  assert.equal(createResponse.status, 201);
  assert.equal(created.version, 1);
  assert.equal(created.currentVersion, 1);

  const listResponse = await fetch(`${baseUrl}/api/models`);
  const listBody = await listResponse.json();

  assert.equal(listResponse.status, 200);
  assert.equal(listBody.models.length, 1);
  assert.equal(listBody.models[0].id, created.id);

  const editedModel = structuredClone(originalModel);
  editedModel.architectureName = 'Edited Model API Example';
  editedModel.services[0].replicas = 3;

  const updateResponse = await fetch(
    `${baseUrl}/api/models/${created.id}`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: editedModel
      })
    }
  );

  const updated = await updateResponse.json();

  assert.equal(updateResponse.status, 200);
  assert.equal(updated.version, 2);
  assert.equal(updated.currentVersion, 2);
  assert.equal(updated.model.services[0].replicas, 3);

  const currentResponse = await fetch(
    `${baseUrl}/api/models/${created.id}`
  );

  const current = await currentResponse.json();

  assert.equal(current.version, 2);
  assert.equal(
    current.model.architectureName,
    'Edited Model API Example'
  );

  const historicalResponse = await fetch(
    `${baseUrl}/api/models/${created.id}?version=1`
  );

  const historical = await historicalResponse.json();

  assert.equal(historicalResponse.status, 200);
  assert.equal(historical.version, 1);
  assert.equal(historical.currentVersion, 2);
  assert.equal(historical.model.services[0].replicas, 2);
  assert.equal(
    historical.model.architectureName,
    'Model API Example'
  );
});

test(
  'analyzes a selected historical model version',
  async (context) => {
    let analyzedModel = null;
    let analyzedQuestion = null;

    const storedModelReasoningFunction = async (model, question) => {
      analyzedModel = model;
      analyzedQuestion = question;

      return {
        status: 'ANSWERED',
        reason: null,
        model,
        modelValidation: {
          isValid: true,
          errors: [],
          warnings: [],
          missingInformation: []
        },
        scenario: {
          type: 'load_multiplication',
          componentId: null,
          newLatencyMs: null,
          latencyMultiplier: null,
          loadMultiplier: 2,
          circuitBreakerFrom: null,
          circuitBreakerTo: null,
          circuitBreakerState: null,
          unsupportedReason: null,
          missingInformation: [],
          assumptions: []
        },
        result: {
          status: 'ANSWERED',
          scenarioType: 'load_multiplication',
          loadMultiplier: 2
        },
        telemetry: {
          totalLatencyMs: 5,
          totalInputTokens: 20,
          totalOutputTokens: 10,
          totalTokens: 30,
          totalEstimatedCostUsd: 0.000024,
          estimatedCostPer1000RequestsUsd: 0.024,
          currency: 'USD',
          calls: {
            architectureExtraction: null,
            scenarioInterpretation: {
              latencyMs: 5,
              inputTokens: 20,
              outputTokens: 10,
              totalTokens: 30
            }
          }
        }
      };
    };

    const { baseUrl } = await startModelApi(context, {
      storedModelReasoningFunction
    });

    const originalModel = createValidModel();

    const createResponse = await fetch(`${baseUrl}/api/models`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: originalModel
      })
    });

    const created = await createResponse.json();

    const editedModel = structuredClone(originalModel);
    editedModel.services[0].replicas = 3;

    await fetch(`${baseUrl}/api/models/${created.id}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: editedModel
      })
    });

    const analyzeResponse = await fetch(
      `${baseUrl}/api/models/${created.id}/analyze`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          version: 1,
          question: '  What happens if incoming load doubles?  '
        })
      }
    );

    const analysis = await analyzeResponse.json();

    assert.equal(analyzeResponse.status, 200);
    assert.equal(analysis.status, 'ANSWERED');
    assert.equal(analysis.storedModel.id, created.id);
    assert.equal(analysis.storedModel.selectedVersion, 1);
    assert.equal(analysis.storedModel.currentVersion, 2);

    // Version 1 had two replicas; version 2 had three.
    assert.equal(analyzedModel.services[0].replicas, 2);

    assert.equal(
      analyzedQuestion,
      'What happens if incoming load doubles?'
    );

    assert.equal(
      analysis.telemetry.calls.architectureExtraction,
      null
    );
  }
);

test('rejects an invalid model through the API', async (context) => {
  const { baseUrl } = await startModelApi(context);

  const invalidModel = createValidModel();
  invalidModel.services[0].replicas = 0;

  const response = await fetch(`${baseUrl}/api/models`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: invalidModel
    })
  });

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, 'INVALID_MODEL');
  assert.ok(body.errors.length > 0);
});

test('reports an unknown stored model', async (context) => {
  const { baseUrl } = await startModelApi(context);

  const response = await fetch(
    `${baseUrl}/api/models/unknown-model-id`
  );

  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.status, 'NOT_FOUND');
});
