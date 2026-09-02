import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateRequestCost
} from '../src/engine/costCalculator.js';

test('calculates cost from measured input and output tokens', () => {
  const result = calculateRequestCost(800, 368);

  assert.equal(result.inputCostUsd, 0.00032);
  assert.equal(result.outputCostUsd, 0.0005888);
  assert.equal(result.totalCostUsd, 0.0009088);
  assert.equal(
    result.estimatedCostPer1000RequestsUsd,
    0.9088
  );
});

test('applies the configured price per one million tokens', () => {
  const result = calculateRequestCost(
    1_000_000,
    1_000_000
  );

  assert.equal(result.inputCostUsd, 0.4);
  assert.equal(result.outputCostUsd, 1.6);
  assert.equal(result.totalCostUsd, 2);
});

test('rejects invalid token measurements', () => {
  assert.throws(
    () => calculateRequestCost(-1, 100),
    /inputTokens must be a non-negative integer/
  );

  assert.throws(
    () => calculateRequestCost(100, 1.5),
    /outputTokens must be a non-negative integer/
  );
});