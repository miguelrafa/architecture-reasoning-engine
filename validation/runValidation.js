import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { reasonAboutArchitecture } from '../src/reasoningEngine.js';

const validationDirectory = path.dirname(
  fileURLToPath(import.meta.url)
);

const reportPath = path.join(
  validationDirectory,
  'latest-report.json'
);

const completeArchitecture = [
  'A checkout API receives 50 requests per second.',
  'The checkout API has 2 replicas, each replica can process',
  '100 requests per second, and its baseline latency is 100 milliseconds.',
  'The checkout API synchronously calls an order service with a',
  '500 millisecond timeout and retries twice using exponential backoff.',
  'The order service has 2 replicas, each replica can process',
  '80 requests per second, and its baseline latency is 200 milliseconds.',
  'The order service synchronously calls a PostgreSQL database with a',
  '300 millisecond timeout and retries once using linear backoff.',
  'The PostgreSQL database has 2 replicas, each replica can process',
  '120 requests per second, and its baseline latency is 50 milliseconds.',
  'The availability target is 99.9 percent and maximum latency is',
  '600 milliseconds.'
].join(' ');

const validationCases = [
  {
    id: 'unavailability-propagation',
    category: 'supported',
    description: completeArchitecture,
    question:
      'What happens if the PostgreSQL database becomes unavailable?',
    allowedStatuses: ['ANSWERED'],
    allowedScenarioTypes: ['component_unavailable'],
    purpose:
      'Verify reverse propagation through required synchronous dependencies.'
  },
  {
    id: 'latency-timeout',
    category: 'supported',
    description: completeArchitecture,
    question:
      'For the order-service component, analyze a latency degradation where its baseline latency is multiplied by 3. Do not model the component as unavailable.',
    allowedStatuses: ['ANSWERED'],
    allowedScenarioTypes: ['latency_degradation'],
    purpose:
      'Verify deterministic comparison between degraded latency and timeout.'
  },
  {
    id: 'incoming-load-multiplication',
    category: 'supported',
    description: completeArchitecture,
    question:
      'What happens if incoming load to the checkout API doubles?',
    allowedStatuses: ['ANSWERED'],
    allowedScenarioTypes: ['load_multiplication'],
    purpose:
      'Verify deterministic capacity and utilization calculations.'
  },
  {
    id: 'missing-baseline-latency',
    category: 'incomplete-input',
    description: [
      'A public API receives 40 requests per second.',
      'It has 2 replicas and each replica can process',
      '100 requests per second.',
      'The API synchronously calls a payment service with a',
      '400 millisecond timeout and one retry with linear backoff.',
      'The payment service has 2 replicas and each replica can process',
      '70 requests per second.',
      'No baseline latency information is available.'
    ].join(' '),
    question:
      'What happens if the payment service latency doubles?',
    allowedStatuses: ['NOT_ANSWERABLE'],
    allowedScenarioTypes: ['latency_degradation'],
    purpose:
      'Verify refusal when a multiplier cannot be applied safely.'
  },
  {
    id: 'unknown-component',
    category: 'incomplete-input',
    description: completeArchitecture,
    question:
      'What happens if the inventory service becomes unavailable?',
    allowedStatuses: ['NOT_ANSWERABLE'],
    purpose:
      'Verify refusal when the requested component is not in the model.'
  },
  {
    id: 'out-of-scope-question',
    category: 'out-of-scope',
    description: completeArchitecture,
    question:
      'Which programming language should the engineering team use?',
    allowedStatuses: ['NOT_ANSWERABLE'],
    allowedScenarioTypes: ['unsupported'],
    purpose:
      'Verify explicit refusal for questions outside supported scenarios.'
  },
  {
    id: 'ambiguous-pronoun',
    category: 'ambiguous-input',
    description: completeArchitecture,
    question:
      'What happens if it fails?',
    allowedStatuses: ['NOT_ANSWERABLE'],
    purpose:
      'Verify that ambiguous component references are not silently invented.'
  },
  {
    id: 'contradictory-replica-count',
    category: 'contradictory-input',
    description: [
      'A gateway receives 30 requests per second.',
      'The gateway has 2 replicas.',
      'The same gateway also has 5 replicas.',
      'Each replica can process 100 requests per second.',
      'Its baseline latency is 80 milliseconds.'
    ].join(' '),
    question:
      'What happens if the gateway becomes unavailable?',
    allowedStatuses: ['ANSWERED', 'NOT_ANSWERABLE'],
    purpose:
      'Observe whether the contradiction is exposed or conservatively refused.'
  },
  {
    id: 'slack-style-description',
    category: 'unstructured-input',
    description: [
      '#architecture checkout',
      'traffic = 60 rps',
      'api: replicas=2 capacity=100rps each latency=90ms',
      'api -> billing: sync, required, timeout=400ms,',
      'retry=1, backoff=linear',
      'billing: replicas=2 capacity=70rps each latency=150ms',
      'availability target: 99.9%'
    ].join('\n'),
    question:
      'What happens if billing becomes unavailable?',
    allowedStatuses: ['ANSWERED'],
    allowedScenarioTypes: ['component_unavailable'],
    purpose:
      'Verify semantic extraction from informal Slack-like text.'
  },
  {
    id: 'retry-amplification',
    category: 'counterintuitive-result',
    description: [
      'A gateway receives 40 requests per second.',
      'The gateway has 1 replica that can process 100 requests per second',
      'and its baseline latency is 50 milliseconds.',
      'It synchronously calls a payment service with a',
      '300 millisecond timeout and retries twice using exponential backoff.',
      'The payment service has 1 replica that can process',
      '100 requests per second and its baseline latency is 100 milliseconds.'
    ].join(' '),
    question:
      'What happens if incoming load to the gateway doubles?',
    allowedStatuses: ['ANSWERED'],
    allowedScenarioTypes: ['load_multiplication'],
    purpose:
      'Show that retry amplification can saturate a dependency even when the original load appears safe.'
  },
  {
    id: 'async-failure-isolation',
    category: 'dependency-semantics',
    description: [
      'An email API receives 20 requests per second.',
      'It has 2 replicas, each replica can process 100 requests per second,',
      'and its baseline latency is 40 milliseconds.',
      'The email API sends events asynchronously to a message queue.',
      'The message queue has 2 replicas, each replica can process',
      '200 requests per second, and its baseline latency is 20 milliseconds.',
      'The asynchronous queue is not required for the API request to complete.'
    ].join(' '),
    question:
      'What happens if the message queue becomes unavailable?',
    allowedStatuses: ['ANSWERED'],
    allowedScenarioTypes: ['component_unavailable'],
    purpose:
      'Verify that unavailable asynchronous dependencies do not propagate like required synchronous calls.'
  },
  {
    id: 'synchronous-cycle',
    category: 'semantic-error',
    description: [
      'Service A receives 10 requests per second.',
      'Service A has 2 replicas, capacity of 100 requests per second',
      'per replica, and baseline latency of 50 milliseconds.',
      'Service B has 2 replicas, capacity of 100 requests per second',
      'per replica, and baseline latency of 60 milliseconds.',
      'Service A synchronously calls Service B with a',
      '300 millisecond timeout and no retries.',
      'Service B synchronously calls Service A with a',
      '300 millisecond timeout and no retries.'
    ].join(' '),
    question:
      'What happens if Service B becomes unavailable?',
    allowedStatuses: ['NOT_ANSWERABLE'],
    purpose:
      'Verify semantic refusal when the formal model contains a synchronous cycle.'
  }
];

/**
 * Calculates a nearest-rank percentile from measured values.
 */
function percentile(values, requestedPercentile) {
  if (values.length === 0) {
    return null;
  }

  const sortedValues = [...values].sort(
    (first, second) => first - second
  );

  const rank = Math.ceil(
    (requestedPercentile / 100) * sortedValues.length
  );

  return sortedValues[Math.max(0, rank - 1)];
}

/**
 * Rounds financial and aggregate measurements for readable reports.
 */
function round(value, digits = 6) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

/**
 * Compares an observed response with the broad expected classification.
 */
function matchesExpectation(testCase, response) {
  const statusMatches = testCase.allowedStatuses.includes(
    response.status
  );

  if (!statusMatches) {
    return false;
  }

  if (!testCase.allowedScenarioTypes) {
    return true;
  }

  return testCase.allowedScenarioTypes.includes(
    response.scenario?.type
  );
}

/**
 * Runs validation sequentially to avoid artificial concurrency and
 * rate-limit effects in latency measurements.
 */
async function runValidation() {
  const startedAt = new Date();
  const results = [];

  console.log(
    `Running ${validationCases.length} validation cases sequentially.`
  );

  for (const [index, testCase] of validationCases.entries()) {
    const caseStartedAt = performance.now();

    console.log(
      `[${index + 1}/${validationCases.length}] ${testCase.id}`
    );

    try {
      const response = await reasonAboutArchitecture(
        testCase.description,
        testCase.question
      );

      results.push({
        id: testCase.id,
        category: testCase.category,
        purpose: testCase.purpose,
        question: testCase.question,
        allowedStatuses: testCase.allowedStatuses,
        allowedScenarioTypes:
          testCase.allowedScenarioTypes ?? null,
        observedStatus: response.status,
        observedScenarioType: response.scenario?.type ?? null,
        matchedExpectation: matchesExpectation(
          testCase,
          response
        ),
        measuredWallClockMs: Math.round(
          performance.now() - caseStartedAt
        ),
        response
      });
    } catch (error) {
      results.push({
        id: testCase.id,
        category: testCase.category,
        purpose: testCase.purpose,
        question: testCase.question,
        allowedStatuses: testCase.allowedStatuses,
        allowedScenarioTypes:
          testCase.allowedScenarioTypes ?? null,
        observedStatus: 'ERROR',
        observedScenarioType: null,
        matchedExpectation: false,
        measuredWallClockMs: Math.round(
          performance.now() - caseStartedAt
        ),
        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }

  const measuredResponses = results.filter((result) =>
    Number.isFinite(
      result.response?.telemetry?.totalLatencyMs
    )
  );

  const latencies = measuredResponses.map(
    (result) => result.response.telemetry.totalLatencyMs
  );

  const totalInputTokens = measuredResponses.reduce(
    (total, result) =>
      total +
      (result.response.telemetry.totalInputTokens ?? 0),
    0
  );

  const totalOutputTokens = measuredResponses.reduce(
    (total, result) =>
      total +
      (result.response.telemetry.totalOutputTokens ?? 0),
    0
  );

  const totalTokens = totalInputTokens + totalOutputTokens;

  const totalEstimatedCostUsd = measuredResponses.reduce(
    (total, result) =>
      total +
      (result.response.telemetry.totalEstimatedCostUsd ?? 0),
    0
  );

  const averageEstimatedCostUsd =
    measuredResponses.length > 0
      ? totalEstimatedCostUsd / measuredResponses.length
      : null;

  const matchedCases = results.filter(
    (result) => result.matchedExpectation
  ).length;

  const report = {
    reportVersion: '1.0',
    generatedAt: new Date().toISOString(),
    executionStartedAt: startedAt.toISOString(),
    executionFinishedAt: new Date().toISOString(),
    methodology: {
      executionMode: 'sequential',
      usesLiveFoundry: true,
      percentileMethod: 'nearest-rank',
      expectationScope:
        'Broad status and supported scenario classification',
      deterministicTests:
        'Executed separately with npm test and without Foundry calls'
    },
    summary: {
      totalCases: results.length,
      matchedCases,
      unmatchedCases: results.length - matchedCases,
      expectationMatchPercent: round(
        (matchedCases / results.length) * 100,
        2
      ),
      measuredResponses: measuredResponses.length,
      latencyMs: {
        minimum:
          latencies.length > 0 ? Math.min(...latencies) : null,
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        maximum:
          latencies.length > 0 ? Math.max(...latencies) : null
      },
      tokenUsage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens
      },
      estimatedCost: {
        currency: 'USD',
        totalUsd: round(totalEstimatedCostUsd),
        averagePerRequestUsd: round(
          averageEstimatedCostUsd
        ),
        projectedPer1000RequestsUsd: round(
          averageEstimatedCostUsd === null
            ? null
            : averageEstimatedCostUsd * 1000,
          4
        )
      }
    },
    cases: results
  };

  await mkdir(validationDirectory, {
    recursive: true
  });

  await writeFile(
    reportPath,
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  console.log('');
  console.log('Validation completed.');
  console.log(
    `Expectation matches: ${matchedCases}/${results.length}`
  );
  console.log(
    `Latency p50: ${report.summary.latencyMs.p50 ?? 'n/a'} ms`
  );
  console.log(
    `Latency p95: ${report.summary.latencyMs.p95 ?? 'n/a'} ms`
  );
  console.log(
    `Total tokens: ${report.summary.tokenUsage.totalTokens}`
  );
  console.log(
    'Projected cost per 1,000 requests: ' +
      `${report.summary.estimatedCost.projectedPer1000RequestsUsd ?? 'n/a'} USD`
  );
  console.log(`Report written to ${reportPath}`);
}

await runValidation();