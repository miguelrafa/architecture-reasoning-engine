import 'dotenv/config';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { reasonAboutArchitecture } from './reasoningEngine.js';

/**
 * Creates the HTTP application.
 *
 * The reasoning function can be replaced during automated tests so tests
 * never need to call Microsoft Foundry.
 */
export function createApp({
  reasoningFunction = reasonAboutArchitecture
} = {}) {
  const app = express();

  // Avoid exposing unnecessary implementation information in HTTP headers.
  app.disable('x-powered-by');

  // Architecture descriptions are small text documents. The limit prevents
  // unexpectedly large requests from consuming excessive memory or tokens.
  app.use(express.json({ limit: '100kb' }));

  /**
   * Lightweight health endpoint.
   *
   * This verifies that the application process is running. It deliberately
   * does not call the language model, so health checks have no token cost.
   */
  app.get('/health', (_request, response) => {
    response.status(200).json({
      status: 'UP',
      service: 'architecture-reasoning-engine'
    });
  });

  /**
   * Converts an architecture description and scenario question into a
   * validated model and a deterministic scenario result.
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
   * Handles malformed JSON and unexpected internal failures without exposing
   * API keys, provider details, or stack traces to the caller.
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

    console.error('Unexpected request failure:', error);

    return response.status(500).json({
      status: 'INTERNAL_ERROR',
      message: 'The architecture analysis could not be completed.'
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