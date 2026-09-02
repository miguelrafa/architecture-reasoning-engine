const form = document.querySelector('#analysis-form');
const descriptionInput = document.querySelector('#description');
const questionInput = document.querySelector('#question');
const analyzeButton = document.querySelector('#analyze-button');
const loadExampleButton = document.querySelector('#load-example-button');
const requestStatus = document.querySelector('#request-status');

const resultsSection = document.querySelector('#results-section');
const resultStatus = document.querySelector('#result-status');
const resultExplanation = document.querySelector('#result-explanation');
const rootCause = document.querySelector('#root-cause');
const affectedComponents = document.querySelector('#affected-components');
const resultAssumptions = document.querySelector('#result-assumptions');

const totalLatency = document.querySelector('#total-latency');
const totalTokens = document.querySelector('#total-tokens');
const requestCost = document.querySelector('#request-cost');
const thousandRequestCost = document.querySelector(
  '#thousand-request-cost'
);

const modelJson = document.querySelector('#model-json');
const validationJson = document.querySelector('#validation-json');
const scenarioJson = document.querySelector('#scenario-json');
const telemetryJson = document.querySelector('#telemetry-json');

/**
 * Example with enough information to exercise extraction, validation,
 * deterministic failure propagation, and telemetry.
 */
const exampleDescription = [
  'A checkout API receives 50 requests per second.',
  'It has 2 replicas, each replica can process 100 requests per second,',
  'and its baseline latency is 100 milliseconds.',
  'The checkout API synchronously calls an order service with a',
  '500 millisecond timeout and retries twice using exponential backoff.',
  'The order service has 2 replicas, each replica can process',
  '80 requests per second, and its baseline latency is 200 milliseconds.',
  'The order service synchronously stores data in a PostgreSQL database',
  'with a 300 millisecond timeout and no retries.',
  'The database has 2 replicas, each replica can process',
  '120 requests per second, and its baseline latency is 50 milliseconds.',
  'The availability target is 99.9 percent and the maximum latency',
  'target is 600 milliseconds.'
].join(' ');

const exampleQuestion =
  'What happens if the PostgreSQL database becomes unavailable?';

/**
 * Writes list values as text nodes to avoid interpreting model output as HTML.
 */
function renderList(element, values, emptyMessage) {
  element.replaceChildren();

  if (!Array.isArray(values) || values.length === 0) {
    const item = document.createElement('li');
    item.textContent = emptyMessage;
    element.append(item);
    return;
  }

  for (const value of values) {
    const item = document.createElement('li');
    item.textContent = String(value);
    element.append(item);
  }
}

/**
 * Formats measured USD values while retaining enough precision for the
 * small per-request costs produced by token-based pricing.
 */
function formatUsd(value, fractionDigits = 6) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  return `${value.toFixed(fractionDigits)} USD`;
}

/**
 * Formats raw objects so the evaluator can inspect the exact formal data.
 */
function formatJson(value) {
  return JSON.stringify(value ?? null, null, 2);
}

/**
 * Converts API errors into one concise message for the user.
 */
function extractErrorMessage(payload, fallbackMessage) {
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    return payload.errors
      .map((error) => error.message)
      .filter(Boolean)
      .join(' ');
  }

  return payload?.message ?? fallbackMessage;
}

/**
 * Displays both the human-readable answer and the inspectable evidence.
 */
function renderAnalysis(payload) {
  const computedResult = payload.result ?? {};
  const telemetry = payload.telemetry ?? {};
  const status = payload.status ?? computedResult.status ?? 'UNKNOWN';

  resultStatus.textContent = status;
  resultStatus.className = 'status-badge';

  if (status !== 'ANSWERED') {
    resultStatus.classList.add('not-answerable');
  }

  resultExplanation.textContent =
    computedResult.explanation ??
    payload.reason ??
    'The request was processed without a textual explanation.';

  rootCause.textContent =
    computedResult.rootCause ??
    computedResult.componentId ??
    payload.scenario?.componentId ??
    'Not applicable';

  renderList(
    affectedComponents,
    computedResult.affectedComponents,
    'No affected components were calculated.'
  );

  renderList(
    resultAssumptions,
    computedResult.assumptions ?? payload.scenario?.assumptions,
    'No additional assumptions were required.'
  );

  totalLatency.textContent = Number.isFinite(telemetry.totalLatencyMs)
    ? `${telemetry.totalLatencyMs} ms`
    : '—';

  totalTokens.textContent = Number.isFinite(telemetry.totalTokens)
    ? telemetry.totalTokens.toLocaleString()
    : '—';

  requestCost.textContent = formatUsd(
    telemetry.totalEstimatedCostUsd
  );

  thousandRequestCost.textContent = formatUsd(
    telemetry.estimatedCostPer1000RequestsUsd,
    4
  );

  modelJson.textContent = formatJson(payload.model);
  validationJson.textContent = formatJson(payload.modelValidation);
  scenarioJson.textContent = formatJson(payload.scenario);
  telemetryJson.textContent = formatJson(payload.telemetry);

  resultsSection.hidden = false;
  resultsSection.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

loadExampleButton.addEventListener('click', () => {
  descriptionInput.value = exampleDescription;
  questionInput.value = exampleQuestion;
  requestStatus.textContent = 'Example loaded. You can edit it before analysis.';
  requestStatus.className = 'request-status';
  descriptionInput.focus();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  analyzeButton.disabled = true;
  analyzeButton.textContent = 'Analyzing…';

  requestStatus.textContent =
    'Structuring the model and calculating the scenario. Please wait.';
  requestStatus.className = 'request-status';

  resultsSection.hidden = true;

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        description: descriptionInput.value,
        question: questionInput.value
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(
        extractErrorMessage(
          payload,
          'The architecture request could not be processed.'
        )
      );
    }

    renderAnalysis(payload);

    requestStatus.textContent =
      'Analysis completed. Calculations and assumptions are shown below.';
  } catch (error) {
    requestStatus.textContent =
      error instanceof Error
        ? error.message
        : 'An unexpected request error occurred.';

    requestStatus.className = 'request-status error';
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = 'Analyze architecture';
  }
});