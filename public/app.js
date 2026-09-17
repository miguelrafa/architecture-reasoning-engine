const form = document.querySelector('#analysis-form');
const descriptionInput = document.querySelector('#description');
const questionInput = document.querySelector('#question');
const analyzeButton = document.querySelector('#analyze-button');
const loadExampleButton = document.querySelector('#load-example-button');
const loadCircuitBreakerExampleButton = document.querySelector(
  '#load-circuit-breaker-example-button'
);
const requestStatus = document.querySelector('#request-status');

const savedAnalysisForm = document.querySelector(
  '#saved-analysis-form'
);
const savedModelSelect = document.querySelector(
  '#saved-model-select'
);
const savedVersionSelect = document.querySelector(
  '#saved-version-select'
);
const savedQuestionInput = document.querySelector(
  '#saved-question'
);
const refreshModelsButton = document.querySelector(
  '#refresh-models-button'
);
const inspectVersionButton = document.querySelector(
  '#inspect-version-button'
);
const analyzeSavedButton = document.querySelector(
  '#analyze-saved-button'
);
const savedModelStatus = document.querySelector(
  '#saved-model-status'
);

const resultsSection = document.querySelector('#results-section');
const resultStatus = document.querySelector('#result-status');
const resultExplanation = document.querySelector(
  '#result-explanation'
);
const missingInformationSection = document.querySelector(
  '#missing-information-section'
);
const missingInformationList = document.querySelector(
  '#missing-information'
);
const rootCause = document.querySelector('#root-cause');
const affectedComponents = document.querySelector(
  '#affected-components'
);
const resultAssumptions = document.querySelector(
  '#result-assumptions'
);

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
const saveModelButton = document.querySelector(
  '#save-model-button'
);
const saveVersionButton = document.querySelector(
  '#save-version-button'
);
const modelStorageStatus = document.querySelector(
  '#model-storage-status'
);

let currentStoredModelId = null;
let availableStoredModels = [];

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
 * Asynchronous example where a durable queue isolates the producer and a
 * circuit breaker protects consumer-to-downstream message delivery.
 */
const circuitBreakerExampleDescription = [
  'An order API receives 20 requests per second and publishes notification',
  'messages asynchronously to a durable notification queue.',
  'The order API has 2 replicas, each processing 100 requests per second,',
  'with a baseline latency of 50 milliseconds.',
  'The notification queue has 2 replicas, each processing 500 messages per',
  'second, with a baseline latency of 10 milliseconds.',
  'The notification queue delivers messages asynchronously to a notification',
  'consumer.',
  'A notification consumer has 2 replicas, each processing 100 messages per',
  'second, with a baseline latency of 25 milliseconds.',
  'The notification consumer communicates asynchronously with an email',
  'service through a circuit breaker. The email service has 2 replicas, each',
  'processing 100 messages per second, with a baseline latency of 80',
  'milliseconds. The circuit breaker opens after 5 consecutive failures,',
  'stays open for 30 seconds, and permits 1 probe call while half-open.',
  'While the circuit breaker is open, pending messages remain in the',
  'notification queue for later retry and the order API is not blocked.',
  'All other dependencies use zero retries.'
].join(' ');

const circuitBreakerExampleQuestion =
  'What happens if the circuit breaker between the notification-consumer and email-service opens?';

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
      extractErrorMessage(
        payload,
        'The request could not be completed.'
      )
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
    busy || !hasEditableModel || currentStoredModelId === null;
}

/**
 * Enables saved-model actions only when a model version is selected.
 */
function updateSavedAnalysisButtons({ busy = false } = {}) {
  const hasModel = savedModelSelect.value !== '';
  const hasVersion = savedVersionSelect.value !== '';
  const hasQuestion = savedQuestionInput.value.trim() !== '';
  const hasSelection = hasModel && hasVersion;

  savedModelSelect.disabled = busy;
  savedVersionSelect.disabled = busy || !hasModel;
  inspectVersionButton.disabled = busy || !hasSelection;
  analyzeSavedButton.disabled =
    busy || !hasSelection || !hasQuestion;
  refreshModelsButton.disabled = busy;
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
 * Updates the interface with a model returned by the repository.
 */
function applyStoredModel(
  storedModel,
  { operation = 'loaded' } = {}
) {
  currentStoredModelId = storedModel.id;

  storedModelId.textContent = storedModel.id;
  storedModelVersion.textContent = String(
    storedModel.currentVersion
  );

  const version = storedModel.version;

  modelVersionBadge.textContent =
    operation === 'saved'
      ? `Version ${version} saved`
      : `Version ${version} selected`;

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

  if (
    model === null ||
    typeof model !== 'object' ||
    Array.isArray(model)
  ) {
    throw new Error('The formal model must be a JSON object.');
  }

  return model;
}

/**
 * Finds metadata for the architecture selected in the interface.
 */
function getSelectedModelSummary() {
  return availableStoredModels.find(
    (model) => model.id === savedModelSelect.value
  );
}

/**
 * Populates all immutable versions for one stored architecture.
 */
function populateVersionOptions(
  modelSummary,
  preferredVersion = null
) {
  savedVersionSelect.replaceChildren();

  if (!modelSummary) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Select a version';
    savedVersionSelect.append(option);
    savedVersionSelect.value = '';
    updateSavedAnalysisButtons();
    return;
  }

  const currentVersion = Number(modelSummary.currentVersion);

  for (
    let version = currentVersion;
    version >= 1;
    version -= 1
  ) {
    const option = document.createElement('option');
    option.value = String(version);
    option.textContent =
      version === currentVersion
        ? `Version ${version} (current)`
        : `Version ${version}`;

    savedVersionSelect.append(option);
  }

  const requestedVersion = String(
    preferredVersion ?? currentVersion
  );

  const requestedVersionExists = Array.from(
    savedVersionSelect.options
  ).some((option) => option.value === requestedVersion);

  savedVersionSelect.value = requestedVersionExists
    ? requestedVersion
    : String(currentVersion);

  updateSavedAnalysisButtons();
}

/**
 * Loads repository summaries and prepares the saved-model selector.
 */
async function loadStoredModels({
  preferredModelId = '',
  preferredVersion = null,
  announce = true
} = {}) {
  refreshModelsButton.textContent = 'Refreshing…';

  if (announce) {
    savedModelStatus.textContent =
      'Loading stored architecture models…';

    savedModelStatus.className = 'request-status';
  }

  updateSavedAnalysisButtons({ busy: true });

  try {
    const payload = await requestJson('/api/models');

    availableStoredModels = Array.isArray(payload)
      ? payload
      : payload.models ?? [];

    savedModelSelect.replaceChildren();

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a stored architecture';
    savedModelSelect.append(placeholder);

    for (const storedModel of availableStoredModels) {
      const option = document.createElement('option');
      option.value = storedModel.id;

      const architectureName =
        storedModel.architectureName ||
        storedModel.name ||
        storedModel.id;

      const versionWord =
        storedModel.currentVersion === 1
          ? 'version'
          : 'versions';

      option.textContent =
        `${architectureName} · ${storedModel.currentVersion} ` +
        `${versionWord}`;

      savedModelSelect.append(option);
    }

    const preferredModelExists = availableStoredModels.some(
      (model) => model.id === preferredModelId
    );

    savedModelSelect.value = preferredModelExists
      ? preferredModelId
      : '';

    populateVersionOptions(
      getSelectedModelSummary(),
      preferredVersion
    );

    if (announce) {
      savedModelStatus.textContent =
        availableStoredModels.length === 0
          ? 'No stored models are available yet.'
          : `${availableStoredModels.length} stored architecture ` +
            `${availableStoredModels.length === 1 ? 'model' : 'models'} ` +
            'available.';

      savedModelStatus.className = 'request-status success';
    }
  } catch (error) {
    availableStoredModels = [];
    savedModelSelect.replaceChildren();

    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Stored models could not be loaded';
    savedModelSelect.append(option);

    populateVersionOptions(null);

    savedModelStatus.textContent =
      error instanceof Error
        ? error.message
        : 'Stored models could not be loaded.';

    savedModelStatus.className = 'request-status error';
  } finally {
    refreshModelsButton.textContent = 'Refresh models';
    updateSavedAnalysisButtons();
  }
}

/**
 * Keeps the saved selectors synchronized after an analysis.
 */
function synchronizeSavedSelection(modelId, version) {
  const summary = availableStoredModels.find(
    (model) => model.id === modelId
  );

  if (!summary) {
    return;
  }

  savedModelSelect.value = modelId;
  populateVersionOptions(summary, version);
}

/**
 * Displays a selected model version before a new scenario is analyzed.
 */
function renderStoredModelInspection(storedModel) {
  resultStatus.textContent = 'MODEL LOADED';
  resultStatus.className = 'status-badge';

  resultExplanation.textContent =
    `Stored architecture version ${storedModel.version} was loaded for ` +
    'inspection. Enter a what-if question to analyze this exact version.';

  missingInformationList.replaceChildren();
  missingInformationSection.hidden = true;

  rootCause.textContent = 'Not applicable';

  renderList(
    affectedComponents,
    [],
    'No scenario has been calculated yet.'
  );

  renderList(
    resultAssumptions,
    [],
    'No scenario assumptions have been generated yet.'
  );

  totalLatency.textContent = '—';
  totalTokens.textContent = '—';
  requestCost.textContent = '—';
  thousandRequestCost.textContent = '—';

  modelJson.textContent = formatJson(storedModel.model);
  validationJson.textContent = formatJson(null);
  scenarioJson.textContent = formatJson(null);
  telemetryJson.textContent = formatJson(null);

  applyStoredModel(storedModel, {
    operation: 'loaded'
  });

  modelStorageStatus.textContent =
    `Version ${storedModel.version} loaded. Editing and saving it will ` +
    'create a new immutable version.';

  modelStorageStatus.className = 'request-status success';

  resultsSection.hidden = false;

  document.querySelector('#model-workspace-heading').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

/**
 * Displays both the human-readable answer and the inspectable evidence.
 */
function renderAnalysis(payload) {
  const computedResult = payload.result ?? {};
  const telemetry = payload.telemetry ?? {};
  const status =
    payload.status ?? computedResult.status ?? 'UNKNOWN';

  resultStatus.textContent = status;
  resultStatus.className = 'status-badge';

  if (status !== 'ANSWERED') {
    resultStatus.classList.add('not-answerable');
  }

  resultExplanation.textContent =
    computedResult.explanation ??
    payload.reason ??
    'The request was processed without a textual explanation.';

  const missingInformation = computedResult.missingInformation;
  const missingItems = (
    Array.isArray(missingInformation)
      ? missingInformation
      : typeof missingInformation === 'string'
        ? [missingInformation]
        : []
  ).filter((item) => typeof item === 'string' && item.trim() !== '');

  missingInformationList.replaceChildren();
  missingInformationSection.hidden =
    status !== 'NOT_ANSWERABLE' || missingItems.length === 0;

  if (!missingInformationSection.hidden) {
    renderList(missingInformationList, missingItems, '');
  }

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
    computedResult.assumptions ??
      payload.scenario?.assumptions,
    'No additional assumptions were required.'
  );

  totalLatency.textContent = Number.isFinite(
    telemetry.totalLatencyMs
  )
    ? `${telemetry.totalLatencyMs} ms`
    : '—';

  totalTokens.textContent = Number.isFinite(
    telemetry.totalTokens
  )
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
  validationJson.textContent = formatJson(
    payload.modelValidation
  );
  scenarioJson.textContent = formatJson(payload.scenario);
  telemetryJson.textContent = formatJson(payload.telemetry);

  if (payload.storedModel?.id) {
    const selectedVersion =
      payload.storedModel.selectedVersion ??
      payload.storedModel.version ??
      payload.storedModel.currentVersion;

    const currentVersion =
      payload.storedModel.currentVersion ?? selectedVersion;

    applyStoredModel(
      {
        id: payload.storedModel.id,
        currentVersion,
        version: selectedVersion,
        model: payload.model
      },
      {
        operation: 'loaded'
      }
    );

    synchronizeSavedSelection(
      payload.storedModel.id,
      selectedVersion
    );

    modelStorageStatus.textContent =
      `Analysis used stored model version ${selectedVersion}.`;

    modelStorageStatus.className = 'request-status success';
  } else {
    resetModelWorkspace(payload.model);
  }

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

loadCircuitBreakerExampleButton.addEventListener('click', () => {
  descriptionInput.value = circuitBreakerExampleDescription;
  questionInput.value = circuitBreakerExampleQuestion;

  requestStatus.textContent =
    'Circuit breaker example loaded. You can edit it before analysis.';

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

    requestStatus.className = 'request-status success';
  } catch (error) {
    requestStatus.textContent =
      error instanceof Error
        ? error.message
        : 'An unexpected request error occurred.';

    requestStatus.className = 'request-status error';
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = 'Analyze new architecture';
  }
});

savedModelSelect.addEventListener('change', () => {
  const modelSummary = getSelectedModelSummary();

  populateVersionOptions(modelSummary);

  if (modelSummary) {
    savedModelStatus.textContent =
      `Selected ${modelSummary.architectureName ?? modelSummary.id}. ` +
      'Choose a version and enter a new what-if question.';

    savedModelStatus.className = 'request-status';
  } else {
    savedModelStatus.textContent =
      'Select a stored architecture to continue.';

    savedModelStatus.className = 'request-status';
  }
});

savedVersionSelect.addEventListener('change', () => {
  updateSavedAnalysisButtons();

  if (
    savedModelSelect.value &&
    savedVersionSelect.value
  ) {
    savedModelStatus.textContent =
      `Version ${savedVersionSelect.value} selected.`;

    savedModelStatus.className = 'request-status';
  }
});

savedQuestionInput.addEventListener('input', () => {
  updateSavedAnalysisButtons();
});

refreshModelsButton.addEventListener('click', async () => {
  await loadStoredModels({
    preferredModelId: savedModelSelect.value,
    preferredVersion: savedVersionSelect.value
  });
});

inspectVersionButton.addEventListener('click', async () => {
  const modelId = savedModelSelect.value;
  const version = savedVersionSelect.value;

  if (!modelId || !version) {
    return;
  }

  inspectVersionButton.textContent = 'Loading…';

  savedModelStatus.textContent =
    `Loading stored model version ${version}…`;

  savedModelStatus.className = 'request-status';

  updateSavedAnalysisButtons({ busy: true });

  try {
    const storedModel = await requestJson(
      `/api/models/${encodeURIComponent(modelId)}` +
        `?version=${encodeURIComponent(version)}`
    );

    renderStoredModelInspection(storedModel);

    savedModelStatus.textContent =
      `Stored model version ${version} loaded successfully.`;

    savedModelStatus.className = 'request-status success';
  } catch (error) {
    savedModelStatus.textContent =
      error instanceof Error
        ? error.message
        : 'The selected model version could not be loaded.';

    savedModelStatus.className = 'request-status error';
  } finally {
    inspectVersionButton.textContent =
      'Inspect selected version';

    updateSavedAnalysisButtons();
  }
});

savedAnalysisForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const modelId = savedModelSelect.value;
  const version = savedVersionSelect.value;

  if (!modelId || !version) {
    return;
  }

  analyzeSavedButton.textContent = 'Analyzing…';

  savedModelStatus.textContent =
    `Analyzing stored model version ${version}. Please wait.`;

  savedModelStatus.className = 'request-status';
  resultsSection.hidden = true;

  updateSavedAnalysisButtons({ busy: true });

  try {
    const payload = await requestJson(
      `/api/models/${encodeURIComponent(modelId)}/analyze`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          version: Number(version),
          question: savedQuestionInput.value
        })
      }
    );

    renderAnalysis(payload);

    savedModelStatus.textContent =
      `Analysis completed using stored model version ${version}.`;

    savedModelStatus.className = 'request-status success';
  } catch (error) {
    savedModelStatus.textContent =
      error instanceof Error
        ? error.message
        : 'The stored model analysis could not be completed.';

    savedModelStatus.className = 'request-status error';
  } finally {
    analyzeSavedButton.textContent =
      'Analyze selected version';

    updateSavedAnalysisButtons();
  }
});

saveModelButton.addEventListener('click', async () => {
  saveModelButton.textContent = 'Saving…';
  modelStorageStatus.textContent =
    'Saving model as version 1…';

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

    applyStoredModel(storedModel, {
      operation: 'saved'
    });

    await loadStoredModels({
      preferredModelId: storedModel.id,
      preferredVersion: storedModel.version,
      announce: false
    });

    modelStorageStatus.textContent =
      'Model saved successfully as version 1.';

    modelStorageStatus.className =
      'request-status success';
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

  modelStorageStatus.textContent =
    'Validating and saving a new version…';

  modelStorageStatus.className = 'request-status';

  updatePersistenceButtons({ busy: true });

  try {
    const model = readEditedModel();

    const storedModel = await requestJson(
      `/api/models/${encodeURIComponent(
        currentStoredModelId
      )}`,
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

    applyStoredModel(storedModel, {
      operation: 'saved'
    });

    await loadStoredModels({
      preferredModelId: storedModel.id,
      preferredVersion: storedModel.version,
      announce: false
    });

    modelStorageStatus.textContent =
      `Model saved successfully as version ${storedModel.version}.`;

    modelStorageStatus.className =
      'request-status success';
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

updatePersistenceButtons();
updateSavedAnalysisButtons();
loadStoredModels();
