const CAPABILITIES = Object.freeze({
  claude: {
    id: 'claude',
    displayName: 'Claude Code',
    aliases: ['claude', 'cc', 'claude-code'],
    binary: 'claude',
    tasks: ['implement', 'review'],
    supports: {
      streaming: true,
      resume: true,
      interrupt: true,
      structuredOutput: false,
      fileEdits: true,
      sandbox: false,
    },
    nativeBridge: {
      supported: true,
      required: true,
      persistent: true,
      constraint: 'never-claude-print',
    },
  },
  codex: {
    id: 'codex',
    displayName: 'Codex',
    aliases: ['codex', 'openai-codex'],
    binary: 'codex',
    tasks: ['implement', 'review'],
    supports: {
      streaming: true,
      resume: true,
      interrupt: true,
      structuredOutput: true,
      fileEdits: true,
      sandbox: true,
    },
    nativeBridge: {
      supported: true,
      required: false,
      persistent: true,
      constraint: null,
    },
  },
  droid: {
    id: 'droid',
    displayName: 'Factory Droid',
    aliases: ['droid', 'factory'],
    binary: 'droid',
    tasks: ['implement', 'spec', 'review'],
    supports: {
      streaming: true,
      resume: true,
      interrupt: true,
      structuredOutput: true,
      fileEdits: true,
      sandbox: false,
    },
    nativeBridge: {
      supported: true,
      required: false,
      persistent: true,
      constraint: 'zen-go-custom-models-only',
    },
  },
  grok: {
    id: 'grok',
    displayName: 'Grok Build',
    aliases: ['grok', 'grok-build'],
    binary: 'grok',
    tasks: ['implement', 'research', 'parallel'],
    supports: {
      streaming: true,
      resume: true,
      interrupt: true,
      structuredOutput: true,
      fileEdits: true,
      sandbox: false,
    },
    nativeBridge: {
      supported: true,
      required: false,
      persistent: true,
      constraint: null,
    },
  },
  amp: {
    id: 'amp',
    displayName: 'Amp',
    aliases: ['amp', 'ampcode'],
    binary: 'amp',
    tasks: ['review', 'implement'],
    supports: {
      streaming: true,
      resume: true,
      interrupt: false,
      structuredOutput: true,
      fileEdits: true,
      sandbox: false,
    },
    nativeBridge: {
      supported: true,
      required: false,
      persistent: true,
      constraint: 'headless-followups-via-web-while-running',
    },
  },
  agy: {
    id: 'agy',
    displayName: 'Google Antigravity CLI',
    aliases: ['agy', 'antigravity'],
    binary: 'agy',
    tasks: ['research', 'review', 'implement'],
    supports: {
      streaming: true,
      resume: true,
      interrupt: true,
      structuredOutput: false,
      fileEdits: true,
      sandbox: false,
    },
    nativeBridge: {
      supported: true,
      required: false,
      persistent: true,
      constraint: null,
    },
  },
  pi: {
    id: 'pi',
    displayName: 'Pi',
    aliases: ['pi'],
    binary: 'pi',
    tasks: ['implement'],
    supports: {
      streaming: false,
      resume: false,
      interrupt: false,
      structuredOutput: false,
      fileEdits: true,
      sandbox: false,
    },
    nativeBridge: {
      supported: false,
      required: false,
      persistent: false,
      constraint: 'experimental',
    },
  },
});

const TASK_DEFAULTS = Object.freeze({
  review: ['codex', 'amp'],
  implement: ['claude', 'codex', 'grok', 'droid'],
  research: ['agy', 'grok'],
  spec: ['droid'],
  image: [],
  parallel: ['grok'],
});

export function listHarnessCapabilities() {
  return Object.values(CAPABILITIES).map((capability) => structuredClone(capability));
}

export function getHarnessCapability(id) {
  const capability = CAPABILITIES[id];
  if (!capability) return null;
  return structuredClone(capability);
}

export function routeTaskDefaults(task) {
  return [...(TASK_DEFAULTS[task] ?? [])];
}