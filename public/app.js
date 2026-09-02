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

const modelVersionBadge = document.querySelector(
  '#model-version-badge'
);
const storedModelId = document.querySelector('#stored-model-id');
const storedModelVersion = document.querySelector(
  '#stored-model-version'
);
const modelEditor = document.querySelector('#model-editor');
const saveModelButton = document.querySelector('#save-model-button');
const saveVersionButton = document.querySelector(
  '#save-version-button'
);
const modelStorageStatus = document.querySelector(
  '#model-storage-status'
);

let currentStoredModelId = null;

/**
 * Example with enough information to exercise extraction, validation,
 * deterministic failure propagation, persistence, and telemetry.
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
      .map((error) => {
        const location = error.field ?? error.path;
        return location
          ? `${location}: ${error.message}`
          : error.message;
      })
      .filter(Boolean)
      .join(' ');
  }

  return payload?.message ?? fallbackMessage;
}

/**
 * Sends an HTTP request and translates error responses into exceptions that
 * can be displayed consistently by the interface.
 */
async function requestJson(url, options = {}) {
  const response = await fetch(url, options);

  let payload;

  try {
    payload = await response.json();
  } catch {
    throw new Error('The server returned an unreadable response.');
  }

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(payload, 'The request could not be completed.')
    );
  }

  return payload;
}

/**
 * Enables only the persistence operation that is valid for the current model.
 */
function updatePersistenceButtons({ busy = false } = {}) {
  const hasEditableModel = modelEditor.value.trim() !== '';

  saveModelButton.disabled =
    busy || !hasEditableModel || currentStoredModelId !== null;

  saveVersionButton.disabled =
    busy || currentStoredModelId === null;
}

/**
 * Resets persistence metadata when a new model has been extracted.
 */
function resetModelWorkspace(model) {
  currentStoredModelId = null;

  storedModelId.textContent = 'Not saved';
  storedModelVersion.textContent = '—';

  modelVersionBadge.textContent = 'Not saved';
  modelVersionBadge.className = 'model-version-badge';

  modelEditor.value = model ? formatJson(model) : '';

  modelStorageStatus.textContent = model
    ? 'Review the extracted model before saving it.'
    : 'No formal model is available to save.';

  modelStorageStatus.className = 'request-status';

  updatePersistenceButtons();
}

/**
 * Updates the interface after the repository saves a model version.
 */
function applyStoredModel(storedModel) {
  currentStoredModelId = storedModel.id;

  storedModelId.textContent = storedModel.id;
  storedModelVersion.textContent = String(storedModel.currentVersion);

  modelVersionBadge.textContent = `Version ${storedModel.version} saved`;
  modelVersionBadge.className = 'model-version-badge saved';

  modelEditor.value = formatJson(storedModel.model);
  modelJson.textContent = formatJson(storedModel.model);

  updatePersistenceButtons();
}

/**
 * Parses the editable model and rejects invalid JSON before an API request.
 */
function readEditedModel() {
  const content = modelEditor.value.trim();

  if (content === '') {
    throw new Error('The formal model JSON cannot be empty.');
  }

  let model;

  try {
    model = JSON.parse(content);
  } catch {
    throw new Error('The formal model contains invalid JSON.');
  }

  if (model === null || typeof model !== 'object' || Array.isArray(model)) {
    throw new Error('The formal model must be a JSON object.');
  }

  return model;
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

  resetModelWorkspace(payload.model);

  resultsSection.hidden = false;
  resultsSection.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

loadExampleButton.addEventListener('click', () => {
  descriptionInput.value = exampleDescription;
  questionInput.value = exampleQuestion;

  requestStatus.textContent =
    'Example loaded. You can edit it before analysis.';

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
    const payload = await requestJson('/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        description: descriptionInput.value,
        question: questionInput.value
      })
    });

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

saveModelButton.addEventListener('click', async () => {
  saveModelButton.textContent = 'Saving…';
  modelStorageStatus.textContent = 'Saving model as version 1…';
  modelStorageStatus.className = 'request-status';

  updatePersistenceButtons({ busy: true });

  try {
    const model = readEditedModel();

    const storedModel = await requestJson('/api/models', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model
      })
    });

    applyStoredModel(storedModel);

    modelStorageStatus.textContent =
      'Model saved successfully as version 1.';

    modelStorageStatus.className = 'request-status success';
  } catch (error) {
    modelStorageStatus.textContent =
      error instanceof Error
        ? error.message
        : 'The model could not be saved.';

    modelStorageStatus.className = 'request-status error';
  } finally {
    saveModelButton.textContent = 'Save model';
    updatePersistenceButtons();
  }
});

saveVersionButton.addEventListener('click', async () => {
  if (!currentStoredModelId) {
    return;
  }

  saveVersionButton.textContent = 'Saving…';
  modelStorageStatus.textContent = 'Validating and saving a new version…';
  modelStorageStatus.className = 'request-status';

  updatePersistenceButtons({ busy: true });

  try {
    const model = readEditedModel();

    const storedModel = await requestJson(
      `/api/models/${encodeURIComponent(currentStoredModelId)}`,
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model
        })
      }
    );

    applyStoredModel(storedModel);

    modelStorageStatus.textContent =
      `Model saved successfully as version ${storedModel.version}.`;

    modelStorageStatus.className = 'request-status success';
  } catch (error) {
    modelStorageStatus.textContent =
      error instanceof Error
        ? error.message
        : 'The new model version could not be saved.';

    modelStorageStatus.className = 'request-status error';
  } finally {
    saveVersionButton.textContent = 'Save new version';
    updatePersistenceButtons();
  }
});

modelEditor.addEventListener('input', () => {
  updatePersistenceButtons();

  if (currentStoredModelId) {
    modelStorageStatus.textContent =
      'The editor contains unsaved changes. Saving creates a new version.';

    modelStorageStatus.className = 'request-status';
  }
});