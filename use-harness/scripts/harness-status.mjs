export const RUN_STATUSES = {
  CREATED: 'created',
  DRY_RUN: 'dry-run',
  RUNNING: 'running',
  SUCCESS: 'success',
  PARTIAL_SUCCESS: 'partial-success',
  WORKER_FAILED: 'worker-failed',
  CLI_MISSING: 'cli-missing',
  TIMEOUT: 'timeout',
  PARSE_FAILED: 'parse-failed',
  CONFIG_INVALID: 'config-invalid',
  NEEDS_HUMAN: 'needs-human',
};

const NEEDS_HUMAN_STATUSES = new Set([
  RUN_STATUSES.CONFIG_INVALID,
  RUN_STATUSES.CLI_MISSING,
]);

const RETRYABLE_STATUSES = new Set([
  RUN_STATUSES.WORKER_FAILED,
  RUN_STATUSES.PARSE_FAILED,
  RUN_STATUSES.TIMEOUT,
]);

export function classifyFailure({ code, message, phase = 'preflight', exitCode = null }) {
  let status = RUN_STATUSES.CONFIG_INVALID;

  switch (code) {
    case 'CWD_INVALID':
    case 'CONFIG_INVALID':
    case 'IMAGE_TASK_REJECTED':
    case 'NO_CLI_RECIPE':
    case 'HARNESS_REQUIRED':
    case 'PROMPT_REQUIRED':
      status = RUN_STATUSES.CONFIG_INVALID;
      break;
    case 'CLI_MISSING':
      status = RUN_STATUSES.CLI_MISSING;
      break;
    case 'PARSE_FAILED':
      status = RUN_STATUSES.PARSE_FAILED;
      break;
    case 'WORKER_FAILED':
      status = RUN_STATUSES.WORKER_FAILED;
      break;
    case 'TIMEOUT':
      status = RUN_STATUSES.TIMEOUT;
      break;
    default:
      if (exitCode !== null && exitCode !== 0) {
        status = RUN_STATUSES.WORKER_FAILED;
      }
      break;
  }

  return {
    status,
    retryable: RETRYABLE_STATUSES.has(status),
    needsHuman: NEEDS_HUMAN_STATUSES.has(status),
    failure: {
      code: code ?? status.toUpperCase().replace(/-/g, '_'),
      message,
      phase,
      retryCount: 0,
      fallbacksTried: [],
    },
  };
}

export function successEnvelope(status = RUN_STATUSES.SUCCESS) {
  return {
    status,
    retryable: false,
    needsHuman: false,
  };
}

export function dryRunEnvelope() {
  return {
    status: RUN_STATUSES.DRY_RUN,
    retryable: false,
    needsHuman: false,
  };
}