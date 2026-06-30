import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildBackendsEnvelope,
  buildCliCommand,
  buildDelegationPrompt,
  buildDoctorEnvelope,
  buildPromptPacket,
  commandSpecToJson,
  parseArgs,
  redactSecrets,
  resolveHarness,
  resolveRunRoot,
  validateCwd,
} from './run-harness.mjs';
import { getHarnessCapability, listHarnessCapabilities, routeTaskDefaults } from './harness-capabilities.mjs';
import { buildRouteDecision } from './harness-routing.mjs';
import { aggregateRun } from './harness-aggregate.mjs';
import { RUN_STATUSES, classifyFailure } from './harness-status.mjs';
import { createRun, appendEvent, writeResult, writeJson, writeText } from './harness-run-store.mjs';
import { droidAutonomyForMode } from './harness-adapters.mjs';

const SCRIPT = fileURLToPath(new URL('./run-harness.mjs', import.meta.url));

test('parseArgs accepts router defaults', () => {
  const opts = parseArgs([
    'node',
    'run-harness.mjs',
    '--harness',
    'codex',
    '--prompt',
    'review the diff',
    '--json',
  ]);

  assert.equal(opts.harness, 'codex');
  assert.equal(opts.task, 'implement');
  assert.equal(opts.prompt, 'review the diff');
  assert.equal(opts.json, true);
  assert.equal(opts.write, false);
});

test('parseArgs accepts --dry-run', () => {
  const opts = parseArgs(['node', 'run-harness.mjs', '--harness', 'codex', '--dry-run']);
  assert.equal(opts.dryRun, true);
});

test('resolveHarness maps aliases', () => {
  assert.equal(resolveHarness('cc'), 'claude');
  assert.equal(resolveHarness('ampcode'), 'amp');
  assert.equal(resolveHarness('antigravity'), 'agy');
  assert.equal(resolveHarness('unknown'), null);
});

test('claude always routes through native bridge', () => {
  const spec = buildCliCommand('claude', {
    prompt: 'implement the task',
    task: 'implement',
    model: 'sonnet',
    mode: null,
    resume: false,
    write: true,
    json: true,
  });

  assert.equal(spec.bin, 'node');
  assert.equal(spec.native, true);
  assert.match(spec.args.join(' '), /harness-native-bridge\.mjs claude/);
});

test('image tasks remain rejected by main CLI contract', () => {
  const opts = parseArgs([
    'node',
    'run-harness.mjs',
    '--harness',
    'agy',
    '--task',
    'image',
    '--prompt',
    'make an image',
  ]);

  assert.equal(opts.task, 'image');
});

test('capabilities include every supported harness', () => {
  const ids = listHarnessCapabilities().map((capability) => capability.id).sort();
  assert.deepEqual(ids, ['agy', 'amp', 'claude', 'codex', 'droid', 'grok', 'pi']);
});

test('capabilities mark critical native bridge behavior', () => {
  assert.equal(getHarnessCapability('claude').nativeBridge.required, true);
  assert.equal(getHarnessCapability('droid').nativeBridge.constraint, 'zen-go-custom-models-only');
  assert.equal(getHarnessCapability('amp').aliases.includes('ampcode'), true);
});

test('routeTaskDefaults preserves current routing recommendations', () => {
  assert.deepEqual(routeTaskDefaults('review'), ['codex', 'amp']);
  assert.deepEqual(routeTaskDefaults('spec'), ['droid']);
  assert.deepEqual(routeTaskDefaults('parallel'), ['grok']);
  assert.deepEqual(routeTaskDefaults('image'), []);
});

test('backends envelope exposes capability data', () => {
  const envelope = buildBackendsEnvelope();
  assert.equal(envelope.ok, true);
  assert.equal(envelope.backends.some((backend) => backend.id === 'codex'), true);
  assert.equal(envelope.backends.some((backend) => backend.id === 'claude'), true);
});

test('doctor envelope reports missing binaries without throwing', () => {
  const envelope = buildDoctorEnvelope({
    whichFn: (binary) => (binary === 'codex' ? '/usr/local/bin/codex' : null),
  });

  const codex = envelope.backends.find((backend) => backend.id === 'codex');
  const claude = envelope.backends.find((backend) => backend.id === 'claude');

  assert.equal(envelope.ok, false);
  assert.equal(codex.available, true);
  assert.equal(claude.available, false);
  assert.equal(claude.code, 'CLI_MISSING');
  assert.match(claude.remediation, /Install/);
});

test('delegation prompt wraps user prompt with manager contract', () => {
  const prompt = buildDelegationPrompt({
    harness: 'codex',
    task: 'review',
    prompt: 'Review src/auth.ts for race conditions.',
    cwd: '/repo',
    write: false,
  });

  assert.match(prompt, /<harness_contract>/);
  assert.match(prompt, /You are an internal worker/);
  assert.match(prompt, /Review src\/auth\.ts for race conditions\./);
  assert.match(prompt, /Return a concise report/);
  assert.match(prompt, /commands_run/);
});

test('buildPromptPacket includes run metadata and result shape', () => {
  const packet = buildPromptPacket({
    run_id: 'codex-test',
    harness: 'codex',
    task: 'review',
    userPrompt: 'Review src/auth.ts',
    cwd: '/repo',
    write: false,
    model: 'gpt-5.3-codex',
    mode: 'xhigh',
    route: { routing_source: 'explicit-harness' },
  });

  assert.match(packet.workerPrompt, /Run ID: codex-test/);
  assert.match(packet.workerPrompt, /Backend: codex/);
  assert.match(packet.workerPrompt, /Task type: review/);
  assert.match(packet.workerPrompt, /Review src\/auth\.ts/);
  assert.match(packet.workerPrompt, /Expected deliverable/);
  assert.match(packet.workerPrompt, /verification:/);
  assert.match(
    packet.workerPrompt,
    /read-only-by-default\n- Model: gpt-5.3-codex\n- Mode: xhigh\n\n## Objective/,
  );
  assert.equal(packet.inputMarkdown, 'Review src/auth.ts');
});

test('createRun exposes artifact paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'use-harness-test-'));
  const receipt = createRun({ root, backend: 'codex', task: 'review' });

  assert.equal(receipt.ok, true);
  assert.equal(receipt.backend, 'codex');
  assert.equal(receipt.status, 'created');
  assert.match(receipt.run_id, /^codex-/);
  assert.ok(receipt.paths.input);
  assert.ok(receipt.paths.prompt);
  assert.ok(receipt.paths.route);
  assert.ok(receipt.paths.command);
  assert.ok(receipt.paths.stdout);
  assert.ok(receipt.paths.stderr);
  assert.ok(receipt.paths.bridge);
  assert.ok(receipt.paths.aggregate);
});

test('run store creates receipt, events, and result files', () => {
  const root = mkdtempSync(join(tmpdir(), 'use-harness-test-'));
  const receipt = createRun({ root, backend: 'codex', task: 'review' });

  appendEvent(receipt.paths.events, {
    run_id: receipt.run_id,
    backend: 'codex',
    type: 'run.started',
    message: 'started',
  });

  writeResult(receipt.paths.result, {
    ok: true,
    run_id: receipt.run_id,
    backend: 'codex',
    status: 'success',
    summary: 'done',
  });

  const eventLine = readFileSync(receipt.paths.events, 'utf8').trim();
  const result = JSON.parse(readFileSync(receipt.paths.result, 'utf8'));

  assert.equal(JSON.parse(eventLine).type, 'run.started');
  assert.equal(result.status, 'success');
});

test('buildRouteDecision handles explicit harness selection', () => {
  const route = buildRouteDecision({
    requestedHarness: 'codex',
    resolvedHarness: 'codex',
    task: 'review',
    model: 'gpt-5.3-codex',
    mode: null,
    write: false,
    rawPrompt: false,
  });

  assert.equal(route.harness, 'codex');
  assert.equal(route.task, 'review');
  assert.equal(route.routing_source, 'explicit-harness');
  assert.equal(route.prompt_strategy, 'wrapped');
  assert.match(route.rationale, /recommends codex, amp/);
});

test('buildRouteDecision handles alias resolution', () => {
  const route = buildRouteDecision({
    requestedHarness: 'ampcode',
    resolvedHarness: 'amp',
    task: 'review',
    model: null,
    mode: null,
    write: false,
    rawPrompt: false,
  });

  assert.equal(route.routing_source, 'alias-resolution');
  assert.match(route.rationale, /ampcode/);
});

test('buildRouteDecision marks native-required for claude', () => {
  const route = buildRouteDecision({
    requestedHarness: 'claude',
    resolvedHarness: 'claude',
    task: 'implement',
    model: 'sonnet',
    mode: null,
    write: true,
    rawPrompt: false,
  });

  assert.equal(route.routing_source, 'native-required');
  assert.match(route.rationale, /native bridge/);
});

test('classifyFailure maps missing CLI to cli-missing', () => {
  const classified = classifyFailure({
    code: 'CLI_MISSING',
    message: 'codex not found',
    phase: 'preflight',
  });

  assert.equal(classified.status, RUN_STATUSES.CLI_MISSING);
  assert.equal(classified.retryable, false);
  assert.equal(classified.needsHuman, true);
});

test('classifyFailure maps invalid cwd to config-invalid', () => {
  const classified = classifyFailure({
    code: 'CWD_INVALID',
    message: 'bad cwd',
    phase: 'preflight',
  });

  assert.equal(classified.status, RUN_STATUSES.CONFIG_INVALID);
  assert.equal(classified.needsHuman, true);
});

test('classifyFailure maps worker failure as retryable', () => {
  const classified = classifyFailure({
    code: 'WORKER_FAILED',
    message: 'exit 1',
    phase: 'worker',
    exitCode: 1,
  });

  assert.equal(classified.status, RUN_STATUSES.WORKER_FAILED);
  assert.equal(classified.retryable, true);
  assert.equal(classified.needsHuman, false);
});

test('aggregateRun works with complete run directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'use-harness-agg-'));
  const receipt = createRun({ root, backend: 'codex', task: 'review' });
  const runDir = receipt.paths.run_dir;

  writeJson(join(runDir, 'route.json'), {
    routing_source: 'explicit-harness',
    rationale: 'test',
    prompt_strategy: 'wrapped',
  });
  writeJson(join(runDir, 'command.json'), { bin: 'codex', display: 'codex exec review' });
  writeResult(receipt.paths.result, {
    ok: true,
    status: 'success',
    harness: 'codex',
    task: 'review',
    text: 'All good',
    run_id: receipt.run_id,
  });
  writeText(join(runDir, 'stdout.log'), 'All good\n');

  const { markdown, json } = aggregateRun(runDir);
  assert.match(markdown, /Harness Run Summary/);
  assert.match(markdown, /codex/);
  assert.equal(json.run_id, receipt.run_id);
  assert.equal(json.status, 'success');
});

test('aggregateRun redacts stderr secrets', () => {
  const root = mkdtempSync(join(tmpdir(), 'use-harness-agg-'));
  const receipt = createRun({ root, backend: 'codex', task: 'review' });
  const runDir = receipt.paths.run_dir;

  writeText(join(runDir, 'stderr.log'), 'OPENAI_API_KEY=sk-secret123 failed');
  const { markdown } = aggregateRun(runDir);
  assert.equal(markdown.includes('sk-secret123'), false);
  assert.match(markdown, /\[REDACTED\]/);
});

test('image task rejection writes preflight artifact directory', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'use-harness-image-'));
  const result = spawnSync(
    process.execPath,
    [
      SCRIPT,
      '--harness',
      'agy',
      '--task',
      'image',
      '--prompt',
      'make an icon',
      '--cwd',
      cwd,
      '--json',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.status, RUN_STATUSES.CONFIG_INVALID);
  assert.ok(envelope.run_id);
  assert.ok(envelope.paths?.run_dir);

  const runDir = envelope.paths.run_dir;
  assert.ok(existsSync(join(runDir, 'receipt.json')));
  assert.ok(existsSync(join(runDir, 'input.md')));
  assert.ok(existsSync(join(runDir, 'prompt.md')));
  assert.ok(existsSync(join(runDir, 'route.json')));
  assert.ok(existsSync(join(runDir, 'result.json')));
  assert.ok(existsSync(join(runDir, 'summary.md')));
  assert.ok(existsSync(join(runDir, 'aggregate.json')));
});

test('resolveRunRoot falls back when cwd is invalid', () => {
  const root = resolveRunRoot('/definitely/not/a/use-harness/path');
  assert.match(root, /\.harness\/runs$/);
});

test('dry-run builds artifacts without requiring harness in PATH', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'use-harness-dry-'));
  const nodeDir = dirname(process.execPath);
  const result = spawnSync(
    process.execPath,
    [
      SCRIPT,
      '--harness',
      'codex',
      '--task',
      'review',
      '--prompt',
      'Review src/auth.ts',
      '--cwd',
      cwd,
      '--dry-run',
      '--json',
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: nodeDir },
    },
  );

  assert.equal(result.status, 0);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.dryRun, true);
  assert.equal(envelope.path, 'dry-run');
  assert.equal(envelope.status, RUN_STATUSES.DRY_RUN);

  const runDir = envelope.paths.run_dir;
  assert.ok(existsSync(join(runDir, 'input.md')));
  assert.ok(existsSync(join(runDir, 'prompt.md')));
  assert.ok(existsSync(join(runDir, 'route.json')));
  assert.ok(existsSync(join(runDir, 'command.json')));
  assert.ok(existsSync(join(runDir, 'result.json')));
  assert.ok(existsSync(join(runDir, 'summary.md')));
  assert.ok(existsSync(join(runDir, 'aggregate.json')));
});

test('commandSpecToJson redacts secrets in display', () => {
  const json = commandSpecToJson(
    { bin: 'codex', args: ['exec', 'OPENAI_API_KEY=sk-abcdef123456'] },
    { cwd: '/repo', task: 'review', model: null, mode: null },
  );
  assert.equal(json.display.includes('sk-abcdef123456'), false);
});

test('droid native autonomy follows mode and write intent', () => {
  assert.equal(droidAutonomyForMode('low', false), 'auto-low');
  assert.equal(droidAutonomyForMode('medium', false), 'auto-medium');
  assert.equal(droidAutonomyForMode('high', false), 'auto-high');
  assert.equal(droidAutonomyForMode(null, true), 'auto-high');
  assert.equal(droidAutonomyForMode('low', true), 'auto-low');
});

test('validateCwd accepts existing directories', () => {
  const result = validateCwd(process.cwd());
  assert.equal(result.ok, true);
  assert.equal(result.realpath.startsWith('/'), true);
});

test('validateCwd rejects missing directories', () => {
  const result = validateCwd('/definitely/not/a/use-harness/path');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CWD_INVALID');
});

test('redactSecrets masks common token shapes', () => {
  const text = 'OPENAI_API_KEY=sk-test123 TOKEN=secretvalue';
  const redacted = redactSecrets(text);
  assert.equal(redacted.includes('sk-test123'), false);
  assert.equal(redacted.includes('secretvalue'), false);
  assert.match(redacted, /OPENAI_API_KEY=\[REDACTED\]/);
  assert.match(redacted, /TOKEN=\[REDACTED\]/);
});

test('parseArgs accepts --raw-prompt to skip delegation wrapping', () => {
  const opts = parseArgs([
    'node',
    'run-harness.mjs',
    '--harness',
    'codex',
    '--prompt',
    'exact instructions',
    '--raw-prompt',
  ]);
  assert.equal(opts.rawPrompt, true);
  assert.equal(opts.prompt, 'exact instructions');
});