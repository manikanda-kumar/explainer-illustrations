import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { redactSecrets } from './harness-redact.mjs';

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function readOptionalJson(path) {
  if (!existsSync(path)) return null;
  try {
    return readJson(path);
  } catch {
    return null;
  }
}

export function readOptionalText(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8');
}

export function readEvents(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function verificationFromText(text) {
  if (!text) return 'not parsed';
  const match = text.match(/verification[:\s]*\{?\s*status[:\s]*["']?(passed|failed|not_run)/i);
  if (match) return match[1];
  if (/verification status/i.test(text)) return 'mentioned in text (not structured)';
  return 'not parsed';
}

function nextActionForStatus(status, failure) {
  switch (status) {
    case 'cli-missing':
      return 'Install the missing harness CLI or choose another backend.';
    case 'config-invalid':
      return failure?.message ?? 'Fix configuration and retry.';
    case 'worker-failed':
      return 'Inspect stderr and worker output; retry with adjusted prompt or harness.';
    case 'parse-failed':
      return 'Check native bridge launch output; retry or attach manually.';
    case 'dry-run':
      return 'Dry run complete; invoke without --dry-run to execute.';
    case 'success':
      return 'Run completed successfully.';
    default:
      return 'Review artifacts and events for details.';
  }
}

export function aggregateRun(runDir) {
  const receipt = readOptionalJson(join(runDir, 'receipt.json'));
  const route = readOptionalJson(join(runDir, 'route.json'));
  const command = readOptionalJson(join(runDir, 'command.json'));
  const result = readOptionalJson(join(runDir, 'result.json'));
  const stdout = readOptionalText(join(runDir, 'stdout.log'));
  const stderrRaw = readOptionalText(join(runDir, 'stderr.log'));
  const stderr = stderrRaw ? redactSecrets(stderrRaw) : null;
  const events = readEvents(join(runDir, 'events.jsonl'));

  const run_id = receipt?.run_id ?? result?.run_id ?? 'unknown';
  const harness = receipt?.backend ?? result?.harness ?? route?.harness ?? 'unknown';
  const task = receipt?.task ?? result?.task ?? route?.task ?? 'unknown';
  const status = result?.status ?? receipt?.status ?? 'unknown';
  const ok = result?.ok ?? false;
  const exitCode = result?.exitCode ?? null;
  const retryable = result?.retryable ?? false;
  const needsHuman = result?.needsHuman ?? false;

  const commandDisplay = command?.display ?? command?.bin ?? 'not recorded';
  const workerText = result?.text ?? stdout ?? '';
  const verification = verificationFromText(workerText);
  const failure = result?.failure;
  const nextAction = nextActionForStatus(status, failure);

  const artifactPaths = receipt?.paths ?? {};
  const artifactList = Object.entries(artifactPaths)
    .filter(([, p]) => p && existsSync(p))
    .map(([name, p]) => `- ${name}: ${p}`)
    .join('\n');

  const markdown = `# Harness Run Summary

## Status

- Run ID: ${run_id}
- Harness: ${harness}
- Task: ${task}
- Status: ${status}
- Exit code: ${exitCode ?? 'n/a'}
- Retryable: ${retryable}
- Needs human: ${needsHuman}

## Routing

${route ? `- Source: ${route.routing_source}\n- Rationale: ${route.rationale}\n- Prompt strategy: ${route.prompt_strategy}` : 'No route.json found.'}

## Command

${command ? `${commandDisplay}` : 'No command.json found.'}

## Worker result

${workerText ? workerText.slice(0, 4000) : 'No worker output recorded.'}

## Verification

${verification}

## Errors

${failure ? `- Phase: ${failure.phase}\n- Code: ${failure.code}\n- Message: ${failure.message}` : stderr ? stderr.slice(0, 2000) : 'None recorded.'}

## Next action

${nextAction}

## Artifacts

${artifactList || 'No artifacts found.'}
`;

  const json = {
    run_id,
    harness,
    task,
    status,
    ok,
    route: route ?? {},
    command: command ?? {},
    result: result ?? {},
    events: {
      count: events.length,
      last_type: events.length ? events[events.length - 1].type : null,
    },
    artifacts: {
      prompt: artifactPaths.prompt,
      stdout: artifactPaths.stdout,
      stderr: artifactPaths.stderr,
      result: artifactPaths.result,
    },
    verification,
    next_action: nextAction,
  };

  return { markdown, json };
}