import { getHarnessCapability, routeTaskDefaults } from './harness-capabilities.mjs';

export function buildRouteDecision({
  requestedHarness,
  resolvedHarness,
  task,
  model,
  mode,
  write,
  rawPrompt,
}) {
  const recommended = routeTaskDefaults(task);
  const isRecommended = recommended.includes(resolvedHarness);
  const isAlias =
    requestedHarness &&
    resolvedHarness &&
    requestedHarness.toLowerCase().trim() !== resolvedHarness;

  const capability = getHarnessCapability(resolvedHarness);
  let routing_source = 'explicit-harness';
  let rationale = `User explicitly selected ${resolvedHarness}`;

  if (isAlias) {
    routing_source = 'alias-resolution';
    rationale = `Alias "${requestedHarness}" resolved to ${resolvedHarness}.`;
  }

  if (capability?.nativeBridge?.required) {
    routing_source = 'native-required';
    rationale = `${resolvedHarness} requires native bridge; CLI one-shot is not used.`;
  } else if (mode) {
    routing_source = 'mode-override';
    rationale = `User selected ${resolvedHarness} with mode override: ${mode}.`;
  }

  if (isRecommended) {
    rationale += ` ${task} task recommends ${recommended.join(', ')}.`;
  } else if (recommended.length > 0) {
    rationale += ` ${task} task typically uses ${recommended.join(', ')}; explicit selection wins.`;
  } else {
    rationale += ` ${task} has no default harness recommendation; explicit selection wins.`;
  }

  return {
    harness: resolvedHarness,
    task,
    mode: mode ?? null,
    model: model ?? null,
    write,
    complexity: null,
    routing_source,
    rationale,
    prompt_strategy: rawPrompt ? 'raw' : 'wrapped',
    fallbacks: [],
    writeIsolation: 'none',
    lockRequired: false,
    budget: {
      mode: 'default',
      fallbackReason: null,
    },
  };
}