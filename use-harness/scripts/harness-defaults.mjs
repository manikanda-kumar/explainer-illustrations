/**
 * Per-harness default model/mode when --model / --mode are omitted.
 * Override via env: <HARNESS>_NATIVE_DEFAULT_MODEL or AMP_NATIVE_DEFAULT_MODE.
 */

const BASE = {
  claude: {
    model: 'sonnet',
    envModel: 'CLAUDE_NATIVE_DEFAULT_MODEL',
  },
  codex: {
    model: 'gpt-5.3-codex',
    envModel: 'CODEX_NATIVE_DEFAULT_MODEL',
  },
  grok: {
    model: 'grok-composer-2.5-fast',
    envModel: 'GROK_NATIVE_DEFAULT_MODEL',
  },
  amp: {
    mode: 'smart',
    envMode: 'AMP_NATIVE_DEFAULT_MODE',
  },
  agy: {
    model: 'Gemini 3.5 Flash (High)',
    envModel: 'AGY_NATIVE_DEFAULT_MODEL',
  },
  droid: {
    model: 'opencode-go/kimi-k2.6',
    envModel: 'DROID_NATIVE_DEFAULT_MODEL',
  },
  pi: {
    model: null,
    envModel: 'PI_DEFAULT_MODEL',
  },
};

/** Task tweaks when user did not pass --model / --mode. */
const TASK_OVERRIDES = {
  codex: {
    review: { model: 'gpt-5.3-codex' },
  },
  amp: {
    review: { mode: 'deep' },
  },
  agy: {
    review: { model: 'Gemini 3.1 Pro (High)' },
    research: { model: 'Gemini 3.1 Pro (High)' },
  },
};

export function defaultModel(harness) {
  const spec = BASE[harness];
  if (!spec) return null;
  const fromEnv = spec.envModel ? process.env[spec.envModel] : null;
  return fromEnv || spec.model || null;
}

export function defaultMode(harness) {
  const spec = BASE[harness];
  if (!spec) return null;
  const fromEnv = spec.envMode ? process.env[spec.envMode] : null;
  return fromEnv || spec.mode || null;
}

export function defaultsForHarness(harness, { task } = {}) {
  const spec = BASE[harness];
  if (!spec) return { model: null, mode: null };

  let model = defaultModel(harness);
  let mode = defaultMode(harness);

  const taskSpec = TASK_OVERRIDES[harness]?.[task];
  if (taskSpec) {
    if (taskSpec.model) model = taskSpec.model;
    if (taskSpec.mode) mode = taskSpec.mode;
  }

  return { model, mode };
}

/** Fill missing model/mode on router or bridge opts (does not override explicit flags). */
export function applyHarnessDefaults(harness, opts) {
  const { model, mode } = defaultsForHarness(harness, { task: opts.task });
  const out = { ...opts };
  if (!out.model && model) out.model = model;
  if (!out.mode && mode) out.mode = mode;
  return out;
}

export function listHarnessDefaults() {
  return Object.fromEntries(
    Object.keys(BASE).map((h) => [h, defaultsForHarness(h)]),
  );
}