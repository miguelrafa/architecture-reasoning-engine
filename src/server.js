import 'dotenv/config';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { ZodError } from 'zod';

import { reasonAboutArchitecture } from './reasoningEngine.js';
import { createModelRepository } from './storage/modelRepository.js';

const publicDirectory = fileURLToPath(
  new URL('../public', import.meta.url)
);

const defaultModelRepository = createModelRepository();

/**
 * Creates the HTTP application.
 *
 * Dependencies can be replaced during automated tests so tests never need
 * to call Microsoft Foundry or write to the production model repository.
 */
export function createApp({
  reasoningFunction = reasonAboutArchitecture,
  modelRepository = defaultModelRepository
} = {}) {
  const app = express();

  // Avoid exposing unnecessary implementation information in HTTP headers.
  app.disable('x-powered-by');

  // The limit prevents unexpectedly large requests from consuming excessive
  // memory or language-model tokens.
  app.use(express.json({ limit: '100kb' }));

  // Serves the browser interface and its local static assets.
  app.use(express.static(publicDirectory));

  /**
   * Verifies that the application process is running.
   *
   * This endpoint deliberately avoids language-model calls and token cost.
   */
  app.get('/health', (_request, response) => {
    response.status(200).json({
      status: 'UP',
      service: 'architecture-reasoning-engine'
    });
  });

  /**
   * Converts natural-language architecture input into a validated model
   * and dispatches the interpreted scenario to deterministic code.
   */
  app.post('/api/analyze', async (request, response, next) => {
    try {
      const { description, question } = request.body ?? {};

      const fieldErrors = [];

      if (typeof description !== 'string' || description.trim() === '') {
        fieldErrors.push({
          field: 'description',
          message: 'Architecture description is required.'
        });
      }

      if (typeof question !== 'string' || question.trim() === '') {
        fieldErrors.push({
          field: 'question',
          message: 'Scenario question is required.'
        });
      }

      if (fieldErrors.length > 0) {
        return response.status(400).json({
          status: 'INVALID_REQUEST',
          errors: fieldErrors
        });
      }

      const result = await reasoningFunction(
        description.trim(),
        question.trim()
      );

      // NOT_ANSWERABLE is a valid reasoning outcome, not an HTTP failure.
      return response.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  /**
   * Lists the stored architecture models without returning every full
   * historical version.
   */
  app.get('/api/models', async (_request, response, next) => {
    try {
      const models = await modelRepository.listModels();

      return response.status(200).json({
        models
      });
    } catch (error) {
      return next(error);
    }
  });

  /**
   * Persists a new formal architecture model as version 1.
   */
  app.post('/api/models', async (request, response, next) => {
    try {
      const { model } = request.body ?? {};

      if (model === null || typeof model !== 'object') {
        return response.status(400).json({
          status: 'INVALID_REQUEST',
          errors: [
            {
              field: 'model',
              message: 'A formal architecture model is required.'
            }
          ]
        });
      }

      const storedModel = await modelRepository.createModel(model);

      return response.status(201).json(storedModel);
    } catch (error) {
      return next(error);
    }
  });

  /**
   * Retrieves the current model or a historical version requested with
   * the optional query parameter: ?version=1
   */
  app.get('/api/models/:id', async (request, response, next) => {
    try {
      const requestedVersion = request.query.version ?? null;

      const storedModel = await modelRepository.getModel(
        request.params.id,
        requestedVersion
      );

      if (!storedModel) {
        return response.status(404).json({
          status: 'NOT_FOUND',
          message: 'The requested architecture model or version was not found.'
        });
      }

      return response.status(200).json(storedModel);
    } catch (error) {
      return next(error);
    }
  });

  /**
   * Validates an edited architecture and stores it as the next version.
   * Existing versions remain unchanged and available for inspection.
   */
  app.put('/api/models/:id', async (request, response, next) => {
    try {
      const { model } = request.body ?? {};

      if (model === null || typeof model !== 'object') {
        return response.status(400).json({
          status: 'INVALID_REQUEST',
          errors: [
            {
              field: 'model',
              message: 'An edited formal architecture model is required.'
            }
          ]
        });
      }

      const storedModel = await modelRepository.updateModel(
        request.params.id,
        model
      );

      if (!storedModel) {
        return response.status(404).json({
          status: 'NOT_FOUND',
          message: 'The architecture model to update was not found.'
        });
      }

      return response.status(200).json(storedModel);
    } catch (error) {
      return next(error);
    }
  });

  /**
   * Handles malformed JSON, invalid formal models, and unexpected failures
   * without exposing provider credentials or stack traces.
   */
  app.use((error, _request, response, _next) => {
    if (error?.type === 'entity.parse.failed') {
      return response.status(400).json({
        status: 'INVALID_REQUEST',
        errors: [
          {
            field: 'body',
            message: 'Request body must contain valid JSON.'
          }
        ]
      });
    }

    if (error instanceof ZodError) {
      return response.status(400).json({
        status: 'INVALID_MODEL',
        errors: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    console.error('Unexpected request failure:', error);

    return response.status(500).json({
      status: 'INTERNAL_ERROR',
      message: 'The request could not be completed.'
    });
  });

  return app;
}

/**
 * Starts the HTTP server when this file is executed directly.
 */
export function startServer() {
  const port = Number(process.env.PORT ?? 3000);
  const app = createApp();

  return app.listen(port, () => {
    console.log(
      `Architecture Reasoning Engine listening on http://localhost:${port}`
    );
  });
}

// Importing this module in a test must not start a network listener.
const currentFile = fileURLToPath(import.meta.url);
const executedFile = process.argv[1]
  ? resolve(process.argv[1])
  : null;

if (executedFile === currentFile) {
  startServer();
}