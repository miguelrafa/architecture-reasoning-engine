import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateAttempts,
  calculateEffectiveLoad,
  calculateMaximumOriginalLoad,
  calculateTotalCapacity,
  calculateUtilization,
  doesTimeoutOccur,
  isSaturated
} from '../src/engine/calculations.js';

test('calculates total capacity from replicas and per-replica capacity', () => {
  const result = calculateTotalCapacity(4, 80);

  assert.equal(result, 320);
});

test('calculates total attempts from retry count', () => {
  const result = calculateAttempts(3);

  assert.equal(result, 4);
});

test('calculates effective load including retry attempts', () => {
  const result = calculateEffectiveLoad(100, 4);

  assert.equal(result, 400);
});

test('calculates utilization as a percentage of total capacity', () => {
  const result = calculateUtilization(400, 320);

  assert.equal(result, 125);
});

test('treats load equal to capacity as saturated', () => {
  const result = isSaturated(320, 320);

  assert.equal(result, true);
});

test('calculates maximum original load before saturation', () => {
  const result = calculateMaximumOriginalLoad(320, 4);

  assert.equal(result, 80);
});

test('detects when scenario latency exceeds the configured timeout', () => {
  const result = doesTimeoutOccur(3000, 2000);

  assert.equal(result, true);
});

test('does not report a timeout when latency stays within the limit', () => {
  const result = doesTimeoutOccur(1500, 2000);

  assert.equal(result, false);
});