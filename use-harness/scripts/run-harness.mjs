#!/usr/bin/env node
/**
 * Route a prompt to a coding agent harness (CLI default, AI SDK optional).
 *
 * Usage:
 *   node run-harness.mjs --harness codex --prompt "review the diff" [--cwd .] [--task review] [--model gpt-5.3-codex-spark] [--json]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { applyHarnessDefaults, defaultsForHarness } from './harness-defaults.mjs';
import { resolveZenGoModel } from './droid-model-resolver.mjs';
import { getAdapter } from './harness-adapters.mjs';
import { listHarnessCapabilities } from './harness-capabilities.mjs';
import { aggregateRun } from './harness-aggregate.mjs';
import { redactSecrets } from './harness-redact.mjs';
import { buildRouteDecision } from './harness-routing.mjs';
import {
  RUN_STATUSES,
  classifyFailure,
  dryRunEnvelope,
  successEnvelope,
} from './harness-status.mjs';
import { appendEvent, createRun, writeJson, writeResult, writeText } from './harness-run-store.mjs';

export { redactSecrets };

const __dirname = dirname(fileURLToPath(import.meta.url));
const NATIVE_BRIDGE = join(__dirname, 'harness-native-bridge.mjs');
const DROID_BRIDGE = join(__dirname, 'droid-native-bridge.mjs');

const NATIVE_HARNESS = new Set(['claude', 'codex', 'grok', 'amp', 'agy', 'droid']);

const HARNESS_ALIASES = {
  claude: 'claude',
  cc: 'claude',
  'claude-code': 'claude',
  codex: 'codex',
  'openai-codex': 'codex',
  droid: 'droid',
  factory: 'droid',
  grok: 'grok',
  'grok-build': 'grok',
  amp: 'amp',
  ampcode: 'amp',
  agy: 'agy',
  antigravity: 'agy',
  pi: 'pi',
};

const TASKS = new Set(['review', 'implement', 'research', 'spec', 'image', 'parallel']);

export function parseArgs(argv) {
  const opts = {
    command: null,
    harness: null,
    task: 'implement',
    prompt: null,
    cwd: process.cwd(),
    model: null,
    modelExplicit: false,
    mode: null,
    json: false,
    resume: false,
    write: false,
    rawPrompt: false,
    dryRun: false,
    runDir: null,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '--harness':
        // Note: `-h` is reserved for --help (standard convention), not --harness.
        opts.harness = next;
        i++;
        break;
      case '--task':
      case '-t':
        opts.task = next;
        i++;
        break;
      case '--prompt':
      case '-p':
        opts.prompt = next;
        i++;
        break;
      case '--cwd':
        opts.cwd = next;
        i++;
        break;
      case '--model':
      case '-m':
        opts.model = next;
        opts.modelExplicit = true;
        i++;
        break;
      case '--mode':
        opts.mode = next;
        i++;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--resume':
        opts.resume = true;
        break;
      case '--write':
        opts.write = true;
        break;
      case '--raw-prompt':
        opts.rawPrompt = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--run-dir':
        opts.runDir = next;
        i++;
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        if (
          !arg.startsWith('-') &&
          !opts.command &&
          ['doctor', 'backends', 'summarize-run'].includes(arg)
        ) {
          opts.command = arg;
          break;
        }
        if (!arg.startsWith('-') && !opts.prompt) {
          opts.prompt = arg;
        }
        break;
    }
  }

  return opts;
}

export function usage() {
  return `use-harness router

Usage:
  node run-harness.mjs backends [--json]
  node run-harness.mjs doctor [--json]
  node run-harness.mjs summarize-run --run-dir <path> [--json]
  node run-harness.mjs --harness <alias> --prompt "<text>" [options]

Options:
  --harness       claude|codex|droid|grok|amp|agy|pi (aliases: cc, ampcode, factory)
  --task, -t      review|implement|research|spec|parallel (default: implement; image is rejected)
  --prompt, -p    Task prompt (required)
  --cwd           Working directory (default: cwd)
  --model, -m     Model override (harness-specific; see defaults below)
  --mode          Per-harness mode override. Claude is always native bridge.
                  codex: native|spark|xhigh
                  grok:  native|check|best-of-n|best-of-n:<N>
                  amp:   native|deep|rush|smart|review
                  droid: native|spec|low|medium|high
                  agy:   native (other values ignored)
                  See SKILL.md "Mode matrix" for semantics.
  --write         Allow file writes. Honored for: claude, codex, droid, agy.
                  Auto-applied for task=implement on codex/droid.
  --raw-prompt    Send --prompt verbatim; skip delegation envelope wrapping.
  --dry-run       Build route/prompt/command artifacts without invoking the harness
  --run-dir       Run directory for summarize-run
  --resume        Resume last session. Honored for: claude, codex, grok, agy,
                  droid, amp (native). Silently ignored elsewhere.
  --json          JSON stdout envelope (see SKILL.md "JSON envelope" for schema)
  --help, -h      Show this help

Defaults (when --model / --mode omitted):
  claude  sonnet
  codex   gpt-5.3-codex
  grok    grok-composer-2.5-fast
  amp     smart (review task: deep)
  agy     Gemini 3.5 Flash (High) (review/research: Gemini 3.1 Pro High)
  droid   opencode-go/kimi-k2.6
  Override: CLAUDE_NATIVE_DEFAULT_MODEL, CODEX_NATIVE_DEFAULT_MODEL, GROK_NATIVE_DEFAULT_MODEL,
            AMP_NATIVE_DEFAULT_MODE, AGY_NATIVE_DEFAULT_MODEL, DROID_NATIVE_DEFAULT_MODEL

Env:
  HARNESS_USE_AI_SDK=1   Try AI SDK HarnessAgent before CLI fallback
`;
}

export function resolveHarness(raw) {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  return HARNESS_ALIASES[key] ?? null;
}

export function buildBackendsEnvelope() {
  return {
    ok: true,
    backends: listHarnessCapabilities(),
  };
}

function remediationForBackend(backend) {
  switch (backend.id) {
    case 'claude':
      return 'Install @anthropic-ai/claude-code and log in with Claude Code.';
    case 'codex':
      return 'Install @openai/codex and configure OPENAI_API_KEY, CODEX_API_KEY, or AI_GATEWAY_API_KEY.';
    case 'droid':
      return 'Install Factory Droid and configure Factory login; Droid native also needs zen/go custom models.';
    case 'grok':
      return 'Install grok-cli or xai-grok and configure XAI_API_KEY or OpenRouter.';
    case 'amp':
      return 'Install @ampcode/amp and run amp login.';
    case 'agy':
      return 'Install Google Antigravity CLI and complete first-run login.';
    case 'pi':
      return 'Install pi CLI if this experimental backend is required.';
    default:
      return 'Install the missing harness CLI or choose another backend.';
  }
}

export function buildDoctorEnvelope({ whichFn = which } = {}) {
  const backends = listHarnessCapabilities().map((backend) => {
    const path = whichFn(backend.binary);
    return {
      id: backend.id,
      displayName: backend.displayName,
      binary: backend.binary,
      available: Boolean(path),
      path: path || undefined,
      code: path ? undefined : 'CLI_MISSING',
      remediation: path ? undefined : remediationForBackend(backend),
      nativeBridge: backend.nativeBridge,
    };
  });

  return {
    ok: backends.every((backend) => backend.available),
    backends,
  };
}

export function buildDelegationPrompt({ harness, task, prompt, cwd, write }) {
  const mode = write ? 'write-enabled' : 'read-only-by-default';
  return `<harness_contract>
You are an internal worker for the use-harness router. You are not user-facing.
Return a concise report to the router; do not address the end user directly.
If you change files, report exactly which files changed and which validation commands ran.
Do not claim success unless validation evidence is included.
</harness_contract>

<assignment>
Backend: ${harness}
Task type: ${task}
Workspace: ${cwd}
Permission mode: ${mode}
</assignment>

<objective>
${prompt}
</objective>

<expected_deliverable>
Return Markdown with these sections:
1. Summary
2. Evidence
3. Files changed
4. Commands run
5. Verification status
6. Blockers
</expected_deliverable>

<result_shape>
summary: string
evidence: string[]
files_changed: string[]
commands_run: { command: string, exit_code: number | null, summary: string }[]
verification: { status: "passed" | "failed" | "not_run", details: string }
blockers: string[]
</result_shape>`;
}

export function buildPromptPacket({
  run_id,
  harness,
  task,
  userPrompt,
  cwd,
  write,
  model,
  mode,
  route,
}) {
  const permissionMode = write ? 'write-enabled' : 'read-only-by-default';
  const assignmentExtras = [model && `- Model: ${model}`, mode && `- Mode: ${mode}`]
    .filter(Boolean)
    .join('\n');
  const assignmentTail = assignmentExtras ? `\n${assignmentExtras}` : '';

  const workerPrompt = `# Harness Worker Packet

## Contract

You are an internal worker for the use-harness router.
Return a concise report to the router; do not address the end user directly.
Do not claim success unless validation evidence is included.

## Assignment

- Run ID: ${run_id}
- Backend: ${harness}
- Task type: ${task}
- Workspace: ${cwd}
- Permission mode: ${permissionMode}${assignmentTail}

## Objective

${userPrompt}

## Scope

Use the objective and named files as scope. Do not broaden unless required.

## Constraints

- Match existing repo patterns.
- Do not commit changes.
- If changing files, report exact files changed.
- If validation cannot run, say why.

## Expected deliverable

1. Summary
2. Evidence
3. Files changed
4. Commands run
5. Verification status
6. Blockers

## Result shape

summary: string
evidence: string[]
files_changed: string[]
commands_run: { command: string, exit_code: number | null, summary: string }[]
verification: { status: "passed" | "failed" | "not_run", details: string }
blockers: string[]`;

  return {
    inputMarkdown: userPrompt,
    workerPrompt,
    metadata: {
      run_id,
      harness,
      task,
      cwd,
      write,
      model,
      mode,
      route,
    },
  };
}

export function validateCwd(cwd) {
  try {
    const realpath = realpathSync(cwd);
    const stat = statSync(realpath);
    if (!stat.isDirectory()) {
      return { ok: false, code: 'CWD_INVALID', message: `${cwd} is not a directory` };
    }
    return { ok: true, realpath };
  } catch (err) {
    return { ok: false, code: 'CWD_INVALID', message: err.message };
  }
}

function which(bin) {
  const result = spawnSync('sh', ['-lc', `command -v ${bin}`], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function run(cmd, args, { cwd, env = process.env, redirectStderr = false, input } = {}) {
  if (redirectStderr) {
    const quoted = [cmd, ...args.map(shellQuote)].join(' ');
    const result = spawnSync('sh', ['-lc', `${quoted} 2>/dev/null`], {
      cwd,
      env,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      input,
    });
    return {
      cmd: quoted,
      status: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }

  const result = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    input,
  });
  return {
    cmd: [cmd, ...args].join(' '),
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function inferWrite(task, explicit) {
  if (explicit) return true;
  return task === 'implement';
}

export function buildCliCommand(harness, opts) {
  const { prompt, task, model, mode, resume, write: writeExplicit, json } = opts;
  const allowWrite = inferWrite(task, writeExplicit);

  switch (harness) {
    case 'claude': {
      // Always tmux native bridge — never `claude -p` (API billing, auth failures).
      return { bin: 'node', args: [NATIVE_BRIDGE, 'claude'], native: true };
    }

    case 'codex': {
      if (mode === 'native') {
        return { bin: 'node', args: [NATIVE_BRIDGE, 'codex'], native: true };
      }
      const out = join(tmpdir(), `codex-out-${process.pid}-${Date.now()}`);
      const args = ['exec', '--skip-git-repo-check', '-o', out];
      if (allowWrite) args.push('--profile', 'edit');
      // Spark precedence: an explicit `--model <id>` wins. Otherwise `--mode spark`
      // or `--model spark` selects the Spark fast model. (applyHarnessDefaults fills
      // in a default model before this runs, so we need `modelExplicit` to tell.)
      if (opts.modelExplicit && model && model !== 'spark') {
        args.push('--model', model);
      } else if (mode === 'spark' || model === 'spark') {
        args.push('--model', 'gpt-5.3-codex-spark');
      } else if (model) {
        args.push('--model', model);
      }
      if (mode === 'xhigh') {
        args.push('--config', 'model_reasoning_effort="xhigh"');
      }
      if (resume) {
        // Preserve codex's exit code, profile/model/config overrides, and surface stderr on
        // failure. Reuse the args built above (`--profile edit`, `--model`, `--config`, `-o`)
        // and feed the prompt via stdin (`-` tells `codex exec resume` to read it from stdin).
        return {
          bin: 'codex',
          args: [...args, 'resume', '--last', '-'],
          outFile: out,
          input: `${prompt}\n`,
        };
      }
      args.push(prompt);
      // No redirectStderr: codex writes progress to stderr; we surface it on non-zero exit.
      return { bin: 'codex', args, outFile: out };
    }

    case 'droid': {
      if (mode === 'native') {
        return { bin: 'node', args: [DROID_BRIDGE], native: true };
      }
      const args = ['exec', '-o', json ? 'json' : 'text'];
      if (task === 'spec' || mode === 'spec') args.push('--use-spec');
      const droidModelInput = model ?? defaultsForHarness('droid').model;
      if (droidModelInput) {
        try {
          args.push('-m', resolveZenGoModel(droidModelInput).droidModel);
        } catch {
          args.push('-m', droidModelInput);
        }
      }
      if (mode && ['low', 'medium', 'high'].includes(mode)) {
        args.push('--reasoning-effort', mode);
      }
      if (allowWrite) args.push('--auto', 'high');
      args.push(prompt);
      return { bin: 'droid', args };
    }

    case 'grok': {
      if (mode === 'native') {
        return { bin: 'node', args: [NATIVE_BRIDGE, 'grok'], native: true };
      }
      const args = ['-p', prompt];
      if (json) args.push('--output-format', 'json');
      else args.push('--output-format', 'plain');
      if (mode === 'check') args.push('--check');
      if (mode?.startsWith('best-of-n:')) {
        const n = mode.split(':')[1] ?? '3';
        args.push('--best-of-n', n);
      } else if (task === 'parallel' || mode === 'best-of-n') {
        args.push('--best-of-n', '3');
      }
      if (resume) args.push('-c');
      const grokModel = model ?? defaultsForHarness('grok').model;
      if (grokModel) args.push('--model', grokModel);
      return { bin: 'grok', args };
    }

    case 'amp': {
      if (mode === 'native') {
        return { bin: 'node', args: [NATIVE_BRIDGE, 'amp'], native: true };
      }
      if (task === 'review' || mode === 'review') {
        const args = ['review'];
        if (json) args.push('--json');
        if (prompt) args.push('-i', prompt);
        return { bin: 'amp', args };
      }
      // Non-review, non-bridge one-shot. `amp threads new` does NOT accept a prompt
      // (it just creates an empty thread), so route to `amp -x` (headless one-shot:
      // runs the prompt, prints the last assistant message, exits).
      const agentMode = mode ?? defaultsForHarness('amp').mode ?? 'smart';
      const args = ['-m', agentMode, '-x', prompt];
      return { bin: 'amp', args };
    }

    case 'agy': {
      if (mode === 'native') {
        return { bin: 'node', args: [NATIVE_BRIDGE, 'agy'], native: true };
      }
      const args = [];
      if (prompt) args.push('-p', prompt);
      const agyModel = model ?? defaultsForHarness('agy').model;
      if (agyModel) args.push('--model', agyModel);
      if (opts.write) args.push('--dangerously-skip-permissions');
      if (resume) args.push('-c');
      return { bin: 'agy', args };
    }

    case 'pi': {
      const args = [];
      if (prompt) args.push('-p', prompt);
      const piModel = model ?? defaultsForHarness('pi').model;
      if (piModel) args.push('--model', piModel);
      return { bin: 'pi', args };
    }

    default:
      return null;
  }
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

export function commandSpecToString(spec) {
  if (!spec) return '';
  const parts = [spec.bin, ...(spec.args ?? [])].map((part) => {
    const str = String(part);
    return /\s/.test(str) ? shellQuote(str) : str;
  });
  return redactSecrets(parts.join(' '));
}

export function commandSpecToJson(spec, opts) {
  return {
    bin: spec?.bin ?? null,
    args: spec?.args ?? [],
    native: Boolean(spec?.native),
    cwd: opts.cwd,
    model: opts.model ?? null,
    mode: opts.mode ?? null,
    task: opts.task,
    display: commandSpecToString(spec),
  };
}

function runHarnessNative(harness, opts) {
  const adapter = getAdapter(harness);
  if (!adapter) {
    return { status: 2, text: '', stderr: `No native adapter for ${harness}`, command: 'native validate' };
  }

  const bridgeScript = harness === 'droid' ? DROID_BRIDGE : NATIVE_BRIDGE;
  const bridgeHarnessArg = harness === 'droid' ? [] : [harness];

  let modelMeta = {};
  if (harness === 'droid') {
    try {
      modelMeta = resolveZenGoModel(opts.model ?? defaultsForHarness('droid').model);
    } catch (err) {
      return { status: 2, text: '', stderr: err.message, command: 'droid-native validate' };
    }
  }

  const launchArgs = [bridgeScript, ...bridgeHarnessArg, 'launch', '--cwd', opts.cwd, '--json'];
  if (opts.prompt) launchArgs.push('--prompt', opts.prompt);
  if (opts.resume) launchArgs.push('--resume', 'last');
  if (opts.write) launchArgs.push('--write');

  if (harness === 'droid' && modelMeta.opencodeGo) {
    launchArgs.push('--model', modelMeta.opencodeGo);
  } else if (opts.model) {
    launchArgs.push('--model', opts.model);
  }

  if (harness === 'codex' && opts.mode === 'xhigh') launchArgs.push('--mode', 'xhigh');
  if (harness === 'codex' && (opts.mode === 'spark' || opts.model === 'spark')) {
    launchArgs.push('--model', 'gpt-5.3-codex-spark');
  }
  if (harness === 'amp') {
    const agentMode = opts.mode ?? defaultsForHarness('amp').mode;
    if (agentMode && ['deep', 'rush', 'smart'].includes(agentMode)) {
      launchArgs.push('--mode', agentMode);
    }
  }
  if (harness === 'agy' && !opts.model) {
    const agyModel = defaultsForHarness('agy', { task: opts.task }).model;
    if (agyModel) launchArgs.push('--model', agyModel);
  }

  const launch = spawnSync('node', launchArgs, { encoding: 'utf8', cwd: opts.cwd });
  if (launch.status !== 0) {
    return {
      status: launch.status ?? 1,
      text: '',
      stderr: launch.stderr || launch.stdout,
      command: launchArgs.join(' '),
    };
  }

  let launchOut;
  try {
    launchOut = JSON.parse(launch.stdout.trim());
  } catch {
    return {
      status: 1,
      text: '',
      stderr: `${harness}-native launch did not return bridge id`,
      command: launchArgs.join(' '),
    };
  }

  const bridgeId = launchOut.id;
  const tailArgs = [bridgeScript, ...bridgeHarnessArg, 'tail', '--id', bridgeId, '--follow', '--json'];
  const tail = spawnSync('node', tailArgs, {
    encoding: 'utf8',
    cwd: opts.cwd,
    maxBuffer: 50 * 1024 * 1024,
  });

  const lines = (tail.stdout || '')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const assistantChunks = lines.filter((e) => e.type === 'assistant' && e.text).map((e) => e.text);
  const text = assistantChunks.join('\n\n').trim();

  const attachCmd = `node ${bridgeScript}${bridgeHarnessArg.length ? ` ${bridgeHarnessArg.join(' ')}` : ''} attach --id ${bridgeId}`;

  return {
    status: tail.status === 0 ? 0 : tail.status ?? 1,
    text,
    stderr: tail.stderr?.trim(),
    command: `${harness}-native bridge ${bridgeId}`,
    bridgeId,
    model: launchOut.model ?? modelMeta.opencodeGo ?? opts.model,
    droidModel: modelMeta.droidModel,
    threadId: launchOut.thread_id,
    threadUrl: launchOut.thread_url,
    note: launchOut.thread_url
      ? `Bridge left running (${bridgeId}). Web: ${launchOut.thread_url} | Attach: ${attachCmd}`
      : `Bridge left running (${bridgeId}). Attach: ${attachCmd}`,
  };
}

async function tryAiSdk(harness, opts) {
  if (process.env.HARNESS_USE_AI_SDK !== '1') return null;

  const adapterMap = {
    claude: '@ai-sdk/harness-claude-code',
    codex: '@ai-sdk/harness-codex',
    pi: '@ai-sdk/harness-pi',
  };

  const pkg = adapterMap[harness];
  if (!pkg) return null;

  try {
    const [{ HarnessAgent }, adapterMod, sandboxMod] = await Promise.all([
      import('@ai-sdk/harness/agent'),
      import(pkg),
      import('@ai-sdk/sandbox-vercel'),
    ]);

    const harnessFactory =
      harness === 'codex'
        ? adapterMod.createCodex?.(opts.model ? { model: opts.model } : {}) ?? adapterMod.codex
        : harness === 'claude'
          ? adapterMod.claudeCode
          : adapterMod.pi;

    const sandbox = sandboxMod.createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
    });

    const agent = new HarnessAgent({ harness: harnessFactory, sandbox });
    const session = await agent.createSession();

    try {
      const result = await agent.generate({ session, prompt: opts.prompt });
      return { path: 'ai-sdk', text: result.text, usage: result.usage };
    } finally {
      await session.destroy();
    }
  } catch (err) {
    return { path: 'ai-sdk-error', error: String(err?.message ?? err) };
  }
}

function completeRun(runReceipt, envelope, harness, { eventType } = {}) {
  if (!runReceipt) return;

  writeResult(runReceipt.paths.result, envelope);

  if (!envelope.ok && envelope.failure) {
    appendEvent(runReceipt.paths.events, {
      run_id: runReceipt.run_id,
      backend: harness,
      type: 'failure.classified',
      status: envelope.status,
      retryable: envelope.retryable,
      needsHuman: envelope.needsHuman,
      message: envelope.failure.message,
    });
  }

  appendEvent(runReceipt.paths.events, {
    run_id: runReceipt.run_id,
    backend: harness,
    type: eventType ?? (envelope.ok ? 'result.written' : 'run.failed'),
    message: envelope.ok ? 'Harness run completed' : 'Harness run failed',
    status: envelope.status,
  });

  const { markdown, json } = aggregateRun(runReceipt.paths.run_dir);
  writeText(runReceipt.paths.summary, markdown);
  writeJson(runReceipt.paths.aggregate, json);
  appendEvent(runReceipt.paths.events, {
    run_id: runReceipt.run_id,
    backend: harness,
    type: 'summary.written',
    message: 'Summary and aggregate artifacts written',
    status: envelope.status,
  });
}

function harnessBinary(harness) {
  const binaries = {
    claude: 'claude',
    codex: 'codex',
    droid: 'droid',
    grok: 'grok',
    amp: 'amp',
    agy: 'agy',
    pi: 'pi',
  };
  return binaries[harness] ?? 'pi';
}

function mergeFailureEnvelope(base, code, message, phase = 'preflight') {
  const classified = classifyFailure({ code, message, phase });
  return {
    ...base,
    ok: false,
    error: message,
    ...classified,
  };
}

function writePromptArtifacts(runReceipt, harness, { userPrompt, workerPrompt }) {
  writeText(runReceipt.paths.input, userPrompt);
  writeText(runReceipt.paths.prompt, workerPrompt);
  appendEvent(runReceipt.paths.events, {
    run_id: runReceipt.run_id,
    backend: harness,
    type: 'prompt.written',
    message: 'Input and prompt artifacts written',
  });
}

export function resolveRunRoot(cwd) {
  const check = validateCwd(cwd);
  if (check.ok) return join(check.realpath, '.harness', 'runs');
  try {
    return join(realpathSync(process.cwd()), '.harness', 'runs');
  } catch {
    return join(tmpdir(), '.harness', 'runs');
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  opts.dryRun ||= process.env.USE_HARNESS_DRY_RUN === '1';

  if (opts.help) {
    console.log(usage());
    process.exit(0);
  }

  if (opts.command === 'backends') {
    const envelope = buildBackendsEnvelope();
    console.log(JSON.stringify(envelope, null, 2));
    process.exit(0);
  }

  if (opts.command === 'doctor') {
    const envelope = buildDoctorEnvelope();
    console.log(JSON.stringify(envelope, null, 2));
    process.exit(envelope.ok ? 0 : 1);
  }

  if (opts.command === 'summarize-run') {
    if (!opts.runDir) {
      console.error('Error: summarize-run requires --run-dir <path>');
      process.exit(2);
    }
    const { markdown, json } = aggregateRun(opts.runDir);
    if (opts.json) {
      console.log(JSON.stringify(json, null, 2));
    } else {
      console.log(markdown);
    }
    process.exit(0);
  }

  function completePreflightFailure({
    harnessName,
    message,
    exitCode = 2,
    code = 'CONFIG_INVALID',
    envelopeExtra = {},
  }) {
    const backend = harnessName ?? 'unknown';
    const runReceipt = createRun({
      root: resolveRunRoot(opts.cwd),
      backend,
      task: opts.task ?? 'implement',
    });
    appendEvent(runReceipt.paths.events, {
      run_id: runReceipt.run_id,
      backend,
      type: 'run.created',
      message: `Created preflight failure run ${runReceipt.run_id}`,
    });

    let route;
    if (harnessName) {
      route = buildRouteDecision({
        requestedHarness: opts.harness,
        resolvedHarness: harnessName,
        task: opts.task,
        model: opts.model,
        mode: opts.mode,
        write: inferWrite(opts.task, opts.write),
        rawPrompt: opts.rawPrompt,
      });
      writeJson(runReceipt.paths.route, route);
      appendEvent(runReceipt.paths.events, {
        run_id: runReceipt.run_id,
        backend,
        type: 'route.selected',
        message: route.rationale,
      });
    }

    if (opts.prompt) {
      let workerPrompt = opts.prompt;
      if (!opts.rawPrompt && harnessName) {
        workerPrompt = buildPromptPacket({
          run_id: runReceipt.run_id,
          harness: harnessName,
          task: opts.task,
          userPrompt: opts.prompt,
          cwd: opts.cwd,
          write: inferWrite(opts.task, opts.write),
          model: opts.model,
          mode: opts.mode,
          route,
        }).workerPrompt;
      }
      writePromptArtifacts(runReceipt, backend, {
        userPrompt: opts.prompt,
        workerPrompt,
      });
    }

    const envelope = mergeFailureEnvelope(
      {
        path: 'cli',
        harness: harnessName ?? undefined,
        task: opts.task,
        run_id: runReceipt.run_id,
        paths: runReceipt.paths,
        route,
        ...envelopeExtra,
      },
      code,
      message,
      'preflight',
    );
    completeRun(runReceipt, envelope, backend);
    if (opts.json) {
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(message);
    }
    process.exit(exitCode);
  }

  const requestedHarness = opts.harness;
  const harness = resolveHarness(opts.harness);
  if (!harness) {
    completePreflightFailure({
      harnessName: null,
      message: 'Error: --harness is required (claude, codex, droid, grok, amp, agy, pi)',
      exitCode: 2,
      code: 'HARNESS_REQUIRED',
    });
  }

  Object.assign(opts, applyHarnessDefaults(harness, opts));

  if (!opts.prompt) {
    completePreflightFailure({
      harnessName: harness,
      message: 'Error: --prompt is required',
      exitCode: 2,
      code: 'PROMPT_REQUIRED',
    });
  }

  if (!TASKS.has(opts.task) && opts.task !== 'implement') {
    console.error(`Warning: unknown task "${opts.task}", continuing anyway`);
  }

  if (opts.task === 'image') {
    completePreflightFailure({
      harnessName: harness,
      message:
        'Image generation is not a harness task. Use nanobanana or baoyu-image-gen skills instead.',
      exitCode: 1,
      code: 'IMAGE_TASK_REJECTED',
    });
  }

  const cwdCheck = validateCwd(opts.cwd);
  if (!cwdCheck.ok) {
    completePreflightFailure({
      harnessName: harness,
      message: cwdCheck.message,
      exitCode: 2,
      code: cwdCheck.code,
      envelopeExtra: {
        remediation: 'Pass --cwd with an existing workspace directory.',
      },
    });
  }
  opts.cwd = cwdCheck.realpath;

  const userPrompt = opts.prompt;
  const allowWrite = inferWrite(opts.task, opts.write);

  const runReceipt = createRun({
    root: join(opts.cwd, '.harness', 'runs'),
    backend: harness,
    task: opts.task,
  });
  appendEvent(runReceipt.paths.events, {
    run_id: runReceipt.run_id,
    backend: harness,
    type: 'run.created',
    message: `Created run ${runReceipt.run_id}`,
  });

  const route = buildRouteDecision({
    requestedHarness,
    resolvedHarness: harness,
    task: opts.task,
    model: opts.model,
    mode: opts.mode,
    write: allowWrite,
    rawPrompt: opts.rawPrompt,
  });
  writeJson(runReceipt.paths.route, route);
  appendEvent(runReceipt.paths.events, {
    run_id: runReceipt.run_id,
    backend: harness,
    type: 'route.selected',
    message: route.rationale,
  });

  let workerPrompt = userPrompt;
  if (!opts.rawPrompt) {
    const packet = buildPromptPacket({
      run_id: runReceipt.run_id,
      harness,
      task: opts.task,
      userPrompt,
      cwd: opts.cwd,
      write: allowWrite,
      model: opts.model,
      mode: opts.mode,
      route,
    });
    workerPrompt = packet.workerPrompt;
  }
  writePromptArtifacts(runReceipt, harness, { userPrompt, workerPrompt });
  opts.prompt = workerPrompt;

  const spec = buildCliCommand(harness, opts);
  if (!spec) {
    const msg = `No CLI recipe for harness: ${harness}`;
    const envelope = mergeFailureEnvelope(
      {
        harness,
        task: opts.task,
        run_id: runReceipt.run_id,
        paths: runReceipt.paths,
        route,
      },
      'NO_CLI_RECIPE',
      msg,
      'preflight',
    );
    completeRun(runReceipt, envelope, harness);
    if (opts.json) console.log(JSON.stringify(envelope, null, 2));
    else console.error(msg);
    process.exit(2);
  }

  const commandJson = commandSpecToJson(spec, opts);
  writeJson(runReceipt.paths.command, commandJson);
  appendEvent(runReceipt.paths.events, {
    run_id: runReceipt.run_id,
    backend: harness,
    type: 'command.built',
    message: commandJson.display,
  });

  if (opts.dryRun) {
    const envelope = {
      ok: true,
      dryRun: true,
      path: 'dry-run',
      harness,
      task: opts.task,
      model: opts.model ?? undefined,
      mode: opts.mode ?? undefined,
      command: commandJson.display,
      exitCode: 0,
      text: 'Dry run: no harness was invoked.',
      run_id: runReceipt.run_id,
      paths: runReceipt.paths,
      route,
      ...dryRunEnvelope(),
    };
    completeRun(runReceipt, envelope, harness, { eventType: 'dry_run.completed' });
    if (opts.json) console.log(JSON.stringify(envelope, null, 2));
    else console.log(envelope.text);
    process.exit(0);
  }

  appendEvent(runReceipt.paths.events, {
    run_id: runReceipt.run_id,
    backend: harness,
    type: 'worker.started',
    message: `Starting ${harness} worker`,
  });

  const bin = which(harnessBinary(harness));
  if (!bin && process.env.HARNESS_USE_AI_SDK !== '1') {
    const msg = `Harness CLI "${harness}" not found in PATH`;
    const envelope = mergeFailureEnvelope(
      {
        harness,
        task: opts.task,
        run_id: runReceipt.run_id,
        paths: runReceipt.paths,
        route,
      },
      'CLI_MISSING',
      msg,
      'preflight',
    );
    completeRun(runReceipt, envelope, harness);
    if (opts.json) console.log(JSON.stringify(envelope, null, 2));
    else console.error(msg);
    process.exit(127);
  }

  const aiResult = await tryAiSdk(harness, opts);
  if (aiResult?.path === 'ai-sdk') {
    writeText(runReceipt.paths.stdout, aiResult.text ?? '');
    const envelope = {
      ok: true,
      path: 'ai-sdk',
      harness,
      task: opts.task,
      text: aiResult.text,
      usage: aiResult.usage,
      run_id: runReceipt.run_id,
      paths: runReceipt.paths,
      route,
      ...successEnvelope(),
    };
    appendEvent(runReceipt.paths.events, {
      run_id: runReceipt.run_id,
      backend: harness,
      type: 'worker.completed',
      message: 'AI SDK worker completed',
      status: RUN_STATUSES.SUCCESS,
    });
    completeRun(runReceipt, envelope, harness);
    console.log(opts.json ? JSON.stringify(envelope, null, 2) : aiResult.text);
    process.exit(0);
  }

  if (spec.native && NATIVE_HARNESS.has(harness)) {
    const nativeResult = runHarnessNative(harness, opts);
    const redactedStderr = redactSecrets(nativeResult.stderr || '') || '';
    if (redactedStderr) writeText(runReceipt.paths.stderr, redactedStderr);
    if (nativeResult.text) {
      writeText(runReceipt.paths.stdout, nativeResult.text);
      writeText(runReceipt.paths.transcript, nativeResult.text);
    }
    if (nativeResult.bridgeId) {
      writeJson(runReceipt.paths.bridge, {
        bridgeId: nativeResult.bridgeId,
        threadId: nativeResult.threadId ?? null,
        threadUrl: nativeResult.threadUrl ?? null,
        attachCommand: nativeResult.note?.includes('Attach:')
          ? nativeResult.note.split('Attach:').pop().trim()
          : null,
      });
    }

    const isParseFailure =
      nativeResult.status !== 0 &&
      /did not return bridge id|did not return JSON/i.test(nativeResult.stderr || '');
    const statusFields =
      nativeResult.status === 0
        ? successEnvelope()
        : classifyFailure({
            code: isParseFailure ? 'PARSE_FAILED' : 'WORKER_FAILED',
            message: nativeResult.stderr || 'Native bridge worker failed',
            phase: 'worker',
            exitCode: nativeResult.status,
          });

    const envelope = {
      ok: nativeResult.status === 0,
      path: `${harness}-native`,
      harness,
      task: opts.task,
      model: nativeResult.model ?? opts.model,
      mode: opts.mode ?? undefined,
      droidModel: nativeResult.droidModel,
      threadId: nativeResult.threadId,
      threadUrl: nativeResult.threadUrl,
      command: nativeResult.command,
      exitCode: nativeResult.status,
      text: nativeResult.text,
      bridgeId: nativeResult.bridgeId,
      stderr: redactedStderr || undefined,
      note: nativeResult.note,
      run_id: runReceipt.run_id,
      paths: runReceipt.paths,
      route,
      ...statusFields,
    };

    appendEvent(runReceipt.paths.events, {
      run_id: runReceipt.run_id,
      backend: harness,
      type: nativeResult.status === 0 ? 'worker.completed' : 'worker.failed',
      message: nativeResult.status === 0 ? 'Native worker completed' : 'Native worker failed',
      status: envelope.status,
    });
    completeRun(runReceipt, envelope, harness);
    if (opts.json) {
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      if (nativeResult.text) console.log(nativeResult.text);
      if (nativeResult.note) console.error(`Note: ${nativeResult.note}`);
      if (nativeResult.status !== 0 && nativeResult.stderr) console.error(nativeResult.stderr);
    }
    process.exit(nativeResult.status === 0 ? 0 : 1);
  }

  if (!which(spec.bin)) {
    const detail = aiResult?.error ? ` AI SDK fallback failed: ${aiResult.error}` : '';
    const msg = `CLI "${spec.bin}" not found.${detail}`;
    const envelope = mergeFailureEnvelope(
      {
        harness,
        task: opts.task,
        run_id: runReceipt.run_id,
        paths: runReceipt.paths,
        route,
      },
      'CLI_MISSING',
      msg,
      'preflight',
    );
    completeRun(runReceipt, envelope, harness);
    if (opts.json) console.log(JSON.stringify(envelope, null, 2));
    else console.error(msg);
    process.exit(127);
  }

  const result = run(spec.bin, spec.args, {
    cwd: opts.cwd,
    redirectStderr: spec.redirectStderr,
    input: spec.input,
  });
  let text = result.stdout;

  writeText(runReceipt.paths.stdout, result.stdout ?? '');
  const redactedStderr = redactSecrets(result.stderr ?? '');
  if (redactedStderr) writeText(runReceipt.paths.stderr, redactedStderr);

  if (spec.outFile && existsSync(spec.outFile)) {
    try {
      text = readFileSync(spec.outFile, 'utf8');
      writeText(runReceipt.paths.transcript, text);
    } finally {
      rmSync(spec.outFile, { force: true });
    }
  }

  const statusFields =
    result.status === 0
      ? successEnvelope()
      : classifyFailure({
          code: 'WORKER_FAILED',
          message: redactedStderr || `Worker exited with status ${result.status}`,
          phase: 'worker',
          exitCode: result.status,
        });

  const envelope = {
    ok: result.status === 0,
    path: 'cli',
    harness,
    task: opts.task,
    model: opts.model ?? undefined,
    mode: opts.mode ?? undefined,
    command: redactSecrets(result.cmd),
    exitCode: result.status,
    text: text.trim(),
    stderr: redactedStderr || undefined,
    note: spec.note,
    aiSdkError: aiResult?.error ? redactSecrets(aiResult.error) : undefined,
    run_id: runReceipt.run_id,
    paths: runReceipt.paths,
    route,
    ...statusFields,
  };

  appendEvent(runReceipt.paths.events, {
    run_id: runReceipt.run_id,
    backend: harness,
    type: result.status === 0 ? 'worker.completed' : 'worker.failed',
    message: result.status === 0 ? 'CLI worker completed' : 'CLI worker failed',
    status: envelope.status,
  });
  completeRun(runReceipt, envelope, harness);
  if (opts.json) {
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    if (text.trim()) console.log(text.trim());
    if (result.status !== 0 && result.stderr.trim()) {
      console.error(result.stderr.trim());
    }
    if (spec.note) console.error(`Note: ${spec.note}`);
  }

  process.exit(result.status === 0 ? 0 : 1);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}