import {
  calculateAttempts,
  calculateEffectiveLoad,
  calculateTotalCapacity,
  calculateUtilization,
  doesTimeoutOccur,
  isSaturated
} from './calculations.js';

/**
 * Deterministic scenario simulations over the formal architecture model.
 *
 * The LLM identifies the scenario and its parameters. This module performs
 * the actual reasoning and produces explicit answer or refusal results.
 */

/**
 * Creates a standard refusal when the formal model cannot support an answer.
 */
function createNotAnswerable(scenarioType, missingInformation) {
  return {
    status: 'NOT_ANSWERABLE',
    scenarioType,
    explanation: 'Not answerable with this model.',
    missingInformation
  };
}

/**
 * Finds a service or data store using its formal identifier.
 */
function findComponent(model, componentId) {
  const components = [...model.services, ...model.dataStores];

  return components.find(
    (component) => component.id === componentId
  );
}

/**
 * Finds every caller affected by an unavailable component.
 *
 * Unavailability propagates only through dependencies that are both
 * synchronous and required. Async or optional dependencies do not
 * automatically make the caller unavailable.
 */
function findAffectedComponents(model, unavailableComponentId) {
  const affectedComponents = new Set([unavailableComponentId]);
  let foundNewAffectedComponent = true;

  while (foundNewAffectedComponent) {
    foundNewAffectedComponent = false;

    for (const dependency of model.dependencies) {
      const dependencyPropagatesFailure =
        dependency.callType === 'sync' &&
        dependency.required === true &&
        affectedComponents.has(dependency.to);

      if (
        dependencyPropagatesFailure &&
        !affectedComponents.has(dependency.from)
      ) {
        affectedComponents.add(dependency.from);
        foundNewAffectedComponent = true;
      }
    }
  }

  return [...affectedComponents];
}

/**
 * Simulates a component becoming unavailable.
 */
export function analyzeComponentUnavailable(model, componentId) {
  const component = findComponent(model, componentId);

  if (component === undefined) {
    return createNotAnswerable(
      'component_unavailable',
      [`Component "${componentId}" does not exist in the formal model.`]
    );
  }

  const affectedComponents = findAffectedComponents(model, componentId);

  return {
    status: 'ANSWERED',
    scenarioType: 'component_unavailable',
    rootCause: componentId,
    affectedComponents,
    assumptions: [
      'Only required synchronous dependencies propagate unavailability.'
    ],
    explanation:
      `Component "${componentId}" is unavailable. ` +
      'The affected component list was calculated by traversing ' +
      'required synchronous dependencies in reverse.'
  };
}

/**
 * Simulates a component changing to a higher scenario latency.
 */
export function analyzeLatencyDegradation(
  model,
  componentId,
  scenarioLatencyMs
) {
  const component = findComponent(model, componentId);

  if (component === undefined) {
    return createNotAnswerable(
      'latency_degradation',
      [`Component "${componentId}" does not exist in the formal model.`]
    );
  }

  if (
    typeof scenarioLatencyMs !== 'number' ||
    scenarioLatencyMs <= 0
  ) {
    return createNotAnswerable(
      'latency_degradation',
      ['A positive scenario latency in milliseconds is required.']
    );
  }

  const synchronousCallers = model.dependencies.filter(
    (dependency) =>
      dependency.to === componentId &&
      dependency.callType === 'sync'
  );

  const callersWithoutTimeout = synchronousCallers.filter(
    (dependency) => dependency.timeoutMs === null
  );

  if (callersWithoutTimeout.length > 0) {
    return createNotAnswerable(
      'latency_degradation',
      callersWithoutTimeout.map(
        (dependency) =>
          `Timeout is missing for "${dependency.from}" to ` +
          `"${dependency.to}".`
      )
    );
  }

  const dependencyResults = synchronousCallers.map(
    (dependency) => ({
      from: dependency.from,
      to: dependency.to,
      required: dependency.required,
      configuredTimeoutMs: dependency.timeoutMs,
      scenarioLatencyMs,
      timeoutOccurs: doesTimeoutOccur(
        scenarioLatencyMs,
        dependency.timeoutMs
      )
    })
  );

  const affectedComponents = new Set([componentId]);

  for (const dependencyResult of dependencyResults) {
    if (
      dependencyResult.required === true &&
      dependencyResult.timeoutOccurs === true
    ) {
      const affectedCallers = findAffectedComponents(
        model,
        dependencyResult.from
      );

      for (const affectedCaller of affectedCallers) {
        affectedComponents.add(affectedCaller);
      }
    }
  }

  return {
    status: 'ANSWERED',
    scenarioType: 'latency_degradation',
    componentId,
    baselineLatencyMs: component.baselineLatencyMs,
    scenarioLatencyMs,
    dependencyResults,
    affectedComponents: [...affectedComponents],
    assumptions: [
      'The scenario latency applies equally to all synchronous callers.',
      'Timeout impact propagates only through required synchronous dependencies.'
    ],
    explanation:
      `Latency impact for "${componentId}" was calculated by comparing ` +
      'the scenario latency with each configured synchronous timeout.'
  };
}

/**
 * Simulates the incoming architecture load being multiplied by N.
 *
 * Entry components are inferred as components without incoming dependencies.
 * Load then flows through the dependency graph, including retry amplification.
 */
export function analyzeLoadMultiplication(model, multiplier) {
  if (typeof multiplier !== 'number' || multiplier <= 0) {
    return createNotAnswerable(
      'load_multiplication',
      ['A positive load multiplier is required.']
    );
  }

  if (model.incomingLoadRps === null) {
    return createNotAnswerable(
      'load_multiplication',
      ['The baseline incoming load is missing from the formal model.']
    );
  }

  const components = [...model.services, ...model.dataStores];

  const componentById = new Map(
    components.map((component) => [component.id, component])
  );

  const missingCapacityInformation = [];

  for (const component of components) {
    if (component.replicas === null) {
      missingCapacityInformation.push(
        `Replica count is missing for "${component.id}".`
      );
    }

    if (component.capacityRpsPerReplica === null) {
      missingCapacityInformation.push(
        `Capacity per replica is missing for "${component.id}".`
      );
    }
  }

  if (missingCapacityInformation.length > 0) {
    return createNotAnswerable(
      'load_multiplication',
      missingCapacityInformation
    );
  }

  const dependenciesWithoutRetryPolicy = model.dependencies.filter(
    (dependency) => dependency.retryPolicy === null
  );

  if (dependenciesWithoutRetryPolicy.length > 0) {
    return createNotAnswerable(
      'load_multiplication',
      dependenciesWithoutRetryPolicy.map(
        (dependency) =>
          `Retry policy is missing for "${dependency.from}" to ` +
          `"${dependency.to}".`
      )
    );
  }

  const outgoingDependencies = new Map(
    components.map((component) => [component.id, []])
  );

  const incomingDependencyCount = new Map(
    components.map((component) => [component.id, 0])
  );

  for (const dependency of model.dependencies) {
    const sourceExists = componentById.has(dependency.from);
    const targetExists = componentById.has(dependency.to);

    if (!sourceExists || !targetExists) {
      return createNotAnswerable(
        'load_multiplication',
        [
          `Dependency "${dependency.from}" to "${dependency.to}" ` +
          'references an unknown component.'
        ]
      );
    }

    outgoingDependencies.get(dependency.from).push(dependency);

    incomingDependencyCount.set(
      dependency.to,
      incomingDependencyCount.get(dependency.to) + 1
    );
  }

  const entryComponents = components.filter(
    (component) =>
      incomingDependencyCount.get(component.id) === 0
  );

  if (entryComponents.length === 0) {
    return createNotAnswerable(
      'load_multiplication',
      [
        'No entry component could be inferred from the dependency graph.'
      ]
    );
  }

  const scenarioIncomingLoadRps =
    model.incomingLoadRps * multiplier;

  const accumulatedLoadRps = new Map(
    components.map((component) => [component.id, 0])
  );

  for (const entryComponent of entryComponents) {
    accumulatedLoadRps.set(
      entryComponent.id,
      scenarioIncomingLoadRps
    );
  }

  const processingQueue = entryComponents.map(
    (component) => component.id
  );

  const componentResults = [];
  let processedComponentCount = 0;

  while (processingQueue.length > 0) {
    const componentId = processingQueue.shift();
    const component = componentById.get(componentId);

    processedComponentCount += 1;

    const effectiveLoadRps = accumulatedLoadRps.get(componentId);

    const totalCapacityRps = calculateTotalCapacity(
      component.replicas,
      component.capacityRpsPerReplica
    );

    const utilizationPercent = calculateUtilization(
      effectiveLoadRps,
      totalCapacityRps
    );

    componentResults.push({
      componentId,
      effectiveLoadRps,
      totalCapacityRps,
      utilizationPercent,
      saturated: isSaturated(
        effectiveLoadRps,
        totalCapacityRps
      )
    });

    for (
      const dependency of outgoingDependencies.get(componentId)
    ) {
      const attempts = calculateAttempts(
        dependency.retryPolicy.maxRetries
      );

      const downstreamLoadRps = calculateEffectiveLoad(
        effectiveLoadRps,
        attempts
      );

      accumulatedLoadRps.set(
        dependency.to,
        accumulatedLoadRps.get(dependency.to) +
          downstreamLoadRps
      );

      incomingDependencyCount.set(
        dependency.to,
        incomingDependencyCount.get(dependency.to) - 1
      );

      if (incomingDependencyCount.get(dependency.to) === 0) {
        processingQueue.push(dependency.to);
      }
    }
  }

  if (processedComponentCount !== components.length) {
    return createNotAnswerable(
      'load_multiplication',
      [
        'Load propagation cannot be calculated because the dependency graph contains a cycle.'
      ]
    );
  }

  return {
    status: 'ANSWERED',
    scenarioType: 'load_multiplication',
    multiplier,
    baselineIncomingLoadRps: model.incomingLoadRps,
    scenarioIncomingLoadRps,
    entryComponents: entryComponents.map(
      (component) => component.id
    ),
    componentResults,
    assumptions: [
      'Components without incoming dependencies are treated as entry points.',
      'Each entry point receives the complete modeled incoming load.',
      'Each dependency produces one downstream call per upstream request.',
      'Retry attempts amplify downstream load.',
      'Loads from multiple upstream paths are added together.'
    ],
    explanation:
      'The multiplied load was propagated through the dependency graph ' +
      'and compared with the deterministic capacity of each component.'
  };
}