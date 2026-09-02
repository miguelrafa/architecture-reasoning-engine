import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

import { createApp } from '../src/server.js';

/**
 * Starts the API on a temporary operating-system-assigned port.
 *
 * Each test receives an isolated server and never needs to call
 * Microsoft Foundry.
 */
async function startTestServer(reasoningFunction) {
  const app = createApp({ reasoningFunction });
  const server = app.listen(0);

  await once(server, 'listening');

  const address = server.address();

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

/**
 * Registers server shutdown as automatic test cleanup.
 */
function closeServerAfterTest(context, server) {
  context.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
  );
}

test('reports that the HTTP service is healthy', async (context) => {
  const reasoningFunction = async () => {
    throw new Error('Health checks must not call the reasoning engine.');
  };

  const { server, baseUrl } = await startTestServer(reasoningFunction);
  closeServerAfterTest(context, server);

  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    status: 'UP',
    service: 'architecture-reasoning-engine'
  });
});

test('analyzes a valid architecture request', async (context) => {
  let receivedDescription = null;
  let receivedQuestion = null;

  const expectedResult = {
    status: 'ANSWERED',
    result: {
      affectedComponents: ['orders', 'api']
    }
  };

  const reasoningFunction = async (description, question) => {
    receivedDescription = description;
    receivedQuestion = question;

    return expectedResult;
  };

  const { server, baseUrl } = await startTestServer(reasoningFunction);
  closeServerAfterTest(context, server);

  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      description: '  API synchronously calls Orders.  ',
      question: '  What happens if Orders becomes unavailable?  '
    })
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, expectedResult);
  assert.equal(receivedDescription, 'API synchronously calls Orders.');
  assert.equal(
    receivedQuestion,
    'What happens if Orders becomes unavailable?'
  );
});

test('rejects a request with missing required fields', async (context) => {
  let reasoningWasCalled = false;

  const reasoningFunction = async () => {
    reasoningWasCalled = true;
    return { status: 'ANSWERED' };
  };

  const { server, baseUrl } = await startTestServer(reasoningFunction);
  closeServerAfterTest(context, server);

  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      description: 'API calls Orders.'
    })
  });

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.status, 'INVALID_REQUEST');
  assert.equal(body.errors[0].field, 'question');
  assert.equal(reasoningWasCalled, false);
});

test('rejects malformed JSON without exposing internals', async (context) => {
  const reasoningFunction = async () => {
    throw new Error('Malformed JSON must not reach the reasoning engine.');
  };

  const { server, baseUrl } = await startTestServer(reasoningFunction);
  closeServerAfterTest(context, server);

  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: '{"description":'
  });

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(body, {
    status: 'INVALID_REQUEST',
    errors: [
      {
        field: 'body',
        message: 'Request body must contain valid JSON.'
      }
    ]
  });
});