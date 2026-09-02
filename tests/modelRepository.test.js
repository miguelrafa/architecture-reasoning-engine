import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createModelRepository } from '../src/storage/modelRepository.js';

/**
 * Creates a complete architecture model accepted by the structural schema.
 */
function createValidModel() {
  return {
    modelVersion: '1.0',
    architectureName: 'Repository Example',
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

/**
 * Creates an isolated temporary repository for each automated test.
 */
async function createTemporaryRepository(context) {
  const directory = await mkdtemp(
    join(tmpdir(), 'architecture-model-repository-')
  );

  context.after(() =>
    rm(directory, {
      recursive: true,
      force: true
    })
  );

  const storagePath = join(directory, 'models.json');

  return {
    storagePath,
    repository: createModelRepository({ storagePath })
  };
}

test('persists and reloads a formal architecture model', async (context) => {
  const { storagePath, repository } =
    await createTemporaryRepository(context);

  const created = await repository.createModel(createValidModel());

  assert.equal(created.version, 1);
  assert.equal(created.currentVersion, 1);
  assert.equal(created.model.architectureName, 'Repository Example');
  assert.equal(typeof created.id, 'string');
  assert.ok(created.id.length > 0);

  // A new repository instance proves that data came from disk.
  const reloadedRepository = createModelRepository({ storagePath });
  const reloaded = await reloadedRepository.getModel(created.id);
  const models = await reloadedRepository.listModels();

  assert.deepEqual(reloaded.model, createValidModel());
  assert.equal(models.length, 1);
  assert.equal(models[0].id, created.id);
  assert.equal(models[0].currentVersion, 1);
});

test('saves edits as a new immutable model version', async (context) => {
  const { repository } = await createTemporaryRepository(context);

  const originalModel = createValidModel();
  const created = await repository.createModel(originalModel);

  const editedModel = structuredClone(originalModel);
  editedModel.architectureName = 'Edited Repository Example';
  editedModel.services[0].replicas = 3;

  const updated = await repository.updateModel(
    created.id,
    editedModel
  );

  const current = await repository.getModel(created.id);
  const historical = await repository.getModel(created.id, 1);

  assert.equal(updated.version, 2);
  assert.equal(updated.currentVersion, 2);
  assert.equal(current.version, 2);
  assert.equal(current.model.services[0].replicas, 3);

  assert.equal(historical.version, 1);
  assert.equal(historical.currentVersion, 2);
  assert.equal(historical.model.services[0].replicas, 2);
  assert.equal(
    historical.model.architectureName,
    'Repository Example'
  );
});

test('rejects an invalid architecture before persistence', async (context) => {
  const { repository } = await createTemporaryRepository(context);

  const invalidModel = createValidModel();
  invalidModel.services[0].replicas = 0;

  await assert.rejects(() =>
    repository.createModel(invalidModel)
  );

  const models = await repository.listModels();

  assert.equal(models.length, 0);
});

test('returns null for unknown models and versions', async (context) => {
  const { repository } = await createTemporaryRepository(context);

  const missingModel = await repository.getModel('unknown-id');

  assert.equal(missingModel, null);

  const created = await repository.createModel(createValidModel());
  const missingVersion = await repository.getModel(created.id, 99);

  assert.equal(missingVersion, null);
});