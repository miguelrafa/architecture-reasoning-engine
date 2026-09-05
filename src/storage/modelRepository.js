import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseArchitectureModel } from '../model/schema.js';

const defaultStoragePath = fileURLToPath(
  new URL('../../data/models.json', import.meta.url)
);

/**
 * Creates the initial on-disk structure when no model store exists yet.
 */
function createEmptyStore() {
  return {
    storeVersion: '1.0',
    records: []
  };
}

/**
 * Returns a detached value so callers cannot accidentally mutate the
 * repository's internal data after an operation has completed.
 */
function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Validates the basic repository file structure before using stored data.
 */
function validateStore(store) {
  if (
    store === null ||
    typeof store !== 'object' ||
    store.storeVersion !== '1.0' ||
    !Array.isArray(store.records)
  ) {
    throw new Error('The model repository file has an invalid structure.');
  }

  return store;
}

/**
 * Builds the inspectable representation returned for one model version.
 */
function createVersionView(record, selectedVersion) {
  return {
    id: record.id,
    architectureName: selectedVersion.model.architectureName,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    currentVersion: record.currentVersion,
    version: selectedVersion.version,
    savedAt: selectedVersion.savedAt,
    model: cloneValue(selectedVersion.model)
  };
}

/**
 * Provides simple JSON-file persistence for the formal architecture model.
 *
 * This repository is intentionally small and transparent for the case study.
 * A write queue prevents two updates in the same process from overwriting
 * each other.
 */
export function createModelRepository({
  storagePath = process.env.MODEL_STORE_PATH ?? defaultStoragePath
} = {}) {
  const resolvedStoragePath = resolve(storagePath);
  let writeQueue = Promise.resolve();

  async function readStore() {
    try {
      const content = await readFile(resolvedStoragePath, 'utf8');
      return validateStore(JSON.parse(content));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return createEmptyStore();
      }

      throw error;
    }
  }

  async function writeStore(store) {
    await mkdir(dirname(resolvedStoragePath), { recursive: true });

    await writeFile(
      resolvedStoragePath,
      `${JSON.stringify(store, null, 2)}\n`,
      'utf8'
    );
  }

  /**
   * Serializes mutations so version numbers remain ordered.
   */
  function runMutation(mutation) {
    const operation = writeQueue.then(async () => {
      const store = await readStore();
      const result = mutation(store);

      await writeStore(store);

      return cloneValue(result);
    });

    // A failed operation must not permanently block later writes.
    writeQueue = operation.catch(() => undefined);

    return operation;
  }

  /**
   * Persists a new architecture as version 1.
   */
  async function createModel(model) {
    const validatedModel = parseArchitectureModel(model);

    return runMutation((store) => {
      const timestamp = new Date().toISOString();

      const record = {
        id: randomUUID(),
        createdAt: timestamp,
        updatedAt: timestamp,
        currentVersion: 1,
        versions: [
          {
            version: 1,
            savedAt: timestamp,
            model: validatedModel
          }
        ]
      };

      store.records.push(record);

      return createVersionView(record, record.versions[0]);
    });
  }

  /**
   * Returns the current version or one requested historical version.
   */
  async function getModel(id, requestedVersion = null) {
    await writeQueue;

    const store = await readStore();
    const record = store.records.find((candidate) => candidate.id === id);

    if (!record) {
      return null;
    }

    const version =
      requestedVersion === null
        ? record.currentVersion
        : Number(requestedVersion);

    if (!Number.isInteger(version) || version < 1) {
      return null;
    }

    const selectedVersion = record.versions.find(
      (candidate) => candidate.version === version
    );

    if (!selectedVersion) {
      return null;
    }

    return createVersionView(record, selectedVersion);
  }

  /**
   * Validates an edited model and saves it as the next immutable version.
   */
  async function updateModel(id, model) {
    const validatedModel = parseArchitectureModel(model);

    return runMutation((store) => {
      const record = store.records.find((candidate) => candidate.id === id);

      if (!record) {
        return null;
      }

      const timestamp = new Date().toISOString();
      const nextVersion = record.currentVersion + 1;

      const versionRecord = {
        version: nextVersion,
        savedAt: timestamp,
        model: validatedModel
      };

      record.versions.push(versionRecord);
      record.currentVersion = nextVersion;
      record.updatedAt = timestamp;

      return createVersionView(record, versionRecord);
    });
  }

  /**
   * Lists saved architectures without duplicating their complete JSON models.
   */
  async function listModels() {
    await writeQueue;

    const store = await readStore();

    return store.records
      .map((record) => {
        const currentVersion = record.versions.find(
          (candidate) => candidate.version === record.currentVersion
        );

        return {
          id: record.id,
          architectureName: currentVersion.model.architectureName,
          currentVersion: record.currentVersion,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt
        };
      })
      .sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
      );
  }

  return {
    storagePath: resolvedStoragePath,
    createModel,
    getModel,
    updateModel,
    listModels
  };
}
