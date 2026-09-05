/**
 * Performs semantic validation after the model has passed Zod validation.
 *
 * Structural validation asks: "Does the JSON have the correct shape?"
 * Semantic validation asks: "Does this architecture make sense?"
 */

function createIssue(code, message, path) {
  return {
    code,
    message,
    path
  };
}

/**
 * Searches for a cycle formed only by synchronous dependencies.
 * Returns the cycle path when found, or null when the graph is acyclic.
 */
function findSynchronousCycle(model) {
  const components = [...model.services, ...model.dataStores];

  const graph = new Map(
    components.map((component) => [component.id, []])
  );

  for (const dependency of model.dependencies) {
    const isKnownDependency =
      graph.has(dependency.from) && graph.has(dependency.to);

    if (dependency.callType === 'sync' && isKnownDependency) {
      graph.get(dependency.from).push(dependency.to);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const currentPath = [];

  function visit(componentId) {
    if (visiting.has(componentId)) {
      const cycleStart = currentPath.indexOf(componentId);
      return [...currentPath.slice(cycleStart), componentId];
    }

    if (visited.has(componentId)) {
      return null;
    }

    visiting.add(componentId);
    currentPath.push(componentId);

    for (const nextComponentId of graph.get(componentId)) {
      const cycle = visit(nextComponentId);

      if (cycle !== null) {
        return cycle;
      }
    }

    currentPath.pop();
    visiting.delete(componentId);
    visited.add(componentId);

    return null;
  }

  for (const componentId of graph.keys()) {
    const cycle = visit(componentId);

    if (cycle !== null) {
      return cycle;
    }
  }

  return null;
}

export function validateSemantics(model) {
  const errors = [];
  const warnings = [];
  const missingInformation = [];

  const components = [...model.services, ...model.dataStores];
  const componentIds = new Set();

  // The case limits the formal graph to a maximum of 15 components.
  if (components.length > 15) {
    errors.push(
      createIssue(
        'GRAPH_TOO_LARGE',
        'The model contains more than 15 components.',
        'services/dataStores'
      )
    );
  }

  for (const component of components) {
    // Every component must have a unique identifier.
    if (componentIds.has(component.id)) {
      errors.push(
        createIssue(
          'DUPLICATE_COMPONENT_ID',
          `Component ID "${component.id}" is duplicated.`,
          component.id
        )
      );
    }

    componentIds.add(component.id);

    // One replica represents a modeled single point of failure.
    if (component.replicas === 1) {
      warnings.push(
        createIssue(
          'SINGLE_POINT_OF_FAILURE',
          `Component "${component.id}" has only one replica.`,
          component.id
        )
      );
    }

    // Null values remain visible instead of being silently invented.
    if (component.replicas === null) {
      missingInformation.push(
        createIssue(
          'MISSING_REPLICA_COUNT',
          `Replica count is missing for "${component.id}".`,
          component.id
        )
      );
    }

    if (component.capacityRpsPerReplica === null) {
      missingInformation.push(
        createIssue(
          'MISSING_CAPACITY',
          `Capacity per replica is missing for "${component.id}".`,
          component.id
        )
      );
    }

    if (component.baselineLatencyMs === null) {
      missingInformation.push(
        createIssue(
          'MISSING_BASELINE_LATENCY',
          `Baseline latency is missing for "${component.id}".`,
          component.id
        )
      );
    }
  }

  for (const dependency of model.dependencies) {
    // Dependencies must reference components that exist in the model.
    if (!componentIds.has(dependency.from)) {
      errors.push(
        createIssue(
          'UNKNOWN_SOURCE_COMPONENT',
          `Dependency source "${dependency.from}" does not exist.`,
          dependency.from
        )
      );
    }

    if (!componentIds.has(dependency.to)) {
      errors.push(
        createIssue(
          'UNKNOWN_TARGET_COMPONENT',
          `Dependency target "${dependency.to}" does not exist.`,
          dependency.to
        )
      );
    }

    // Synchronous calls require a timeout for latency reasoning.
    if (dependency.callType === 'sync' && dependency.timeoutMs === null) {
      missingInformation.push(
        createIssue(
          'MISSING_SYNC_TIMEOUT',
          `Synchronous dependency "${dependency.from}" to "${dependency.to}" has no timeout.`,
          `${dependency.from}->${dependency.to}`
        )
      );
    }

    if (dependency.retryPolicy === null) {
      missingInformation.push(
        createIssue(
          'MISSING_RETRY_POLICY',
          `Retry policy is missing for "${dependency.from}" to "${dependency.to}".`,
          `${dependency.from}->${dependency.to}`
        )
      );
    } else if (
      dependency.retryPolicy.maxRetries > 0 &&
      dependency.retryPolicy.backoff === 'none'
    ) {
      warnings.push(
        createIssue(
          'RETRIES_WITHOUT_BACKOFF',
          `Dependency "${dependency.from}" to "${dependency.to}" retries without backoff.`,
          `${dependency.from}->${dependency.to}`
        )
      );
    }

    const circuitBreaker = dependency.circuitBreaker ?? null;

    if (circuitBreaker !== null) {
      const dependencyPath = `${dependency.from}->${dependency.to}`;

      if (
        circuitBreaker.openBehavior === 'retain_in_queue' &&
        dependency.callType !== 'async'
      ) {
        errors.push(
          createIssue(
            'QUEUE_RETENTION_REQUIRES_ASYNC_DEPENDENCY',
            `Circuit breaker on "${dependency.from}" to ` +
              `"${dependency.to}" retains messages but the dependency ` +
              'is not asynchronous.',
            dependencyPath
          )
        );
      }

      if (circuitBreaker.messageBufferComponentId === null) {
        missingInformation.push(
          createIssue(
            'MISSING_MESSAGE_BUFFER',
            `Circuit breaker on "${dependency.from}" to ` +
              `"${dependency.to}" does not identify the queue or message ` +
              'buffer that retains pending messages.',
            dependencyPath
          )
        );
      } else if (
        !componentIds.has(circuitBreaker.messageBufferComponentId)
      ) {
        errors.push(
          createIssue(
            'UNKNOWN_MESSAGE_BUFFER',
            `Message buffer "${circuitBreaker.messageBufferComponentId}" ` +
              'does not exist in the architecture model.',
            dependencyPath
          )
        );
      }

      if (circuitBreaker.openBehavior === null) {
        missingInformation.push(
          createIssue(
            'MISSING_CIRCUIT_BREAKER_OPEN_BEHAVIOR',
            `Open-state behavior is missing for the circuit breaker on ` +
              `"${dependency.from}" to "${dependency.to}".`,
            dependencyPath
          )
        );
      }

      if (circuitBreaker.failureThreshold === null) {
        missingInformation.push(
          createIssue(
            'MISSING_CIRCUIT_BREAKER_FAILURE_THRESHOLD',
            `Failure threshold is missing for the circuit breaker on ` +
              `"${dependency.from}" to "${dependency.to}".`,
            dependencyPath
          )
        );
      }

      if (circuitBreaker.openDurationMs === null) {
        missingInformation.push(
          createIssue(
            'MISSING_CIRCUIT_BREAKER_OPEN_DURATION',
            `Open duration is missing for the circuit breaker on ` +
              `"${dependency.from}" to "${dependency.to}".`,
            dependencyPath
          )
        );
      }

      if (circuitBreaker.halfOpenMaxCalls === null) {
        missingInformation.push(
          createIssue(
            'MISSING_CIRCUIT_BREAKER_HALF_OPEN_LIMIT',
            `Half-open probe limit is missing for the circuit breaker on ` +
              `"${dependency.from}" to "${dependency.to}".`,
            dependencyPath
          )
        );
      }
    }
  }

  // A synchronous cycle can leave components waiting on one another.
  const synchronousCycle = findSynchronousCycle(model);

  if (synchronousCycle !== null) {
    errors.push(
      createIssue(
        'SYNCHRONOUS_CYCLE',
        `Synchronous cycle detected: ${synchronousCycle.join(' -> ')}.`,
        'dependencies'
      )
    );
  }

  if (model.incomingLoadRps === null) {
    missingInformation.push(
      createIssue(
        'MISSING_INCOMING_LOAD',
        'Incoming load is required for load multiplication scenarios.',
        'incomingLoadRps'
      )
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    missingInformation
  };
}
