/**
 * Shared tmux + inject + tail infrastructure for harness-native bridges.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

import { applyHarnessDefaults } from './harness-defaults.mjs';

export const LOCK_STALE_MS = 120_000;
export const WARM_TIMEOUT_MS = 45_000;
export const IDLE_MS = 2000;
export const FOLLOW_TIMEOUT_MS = 300_000;

export function bridgeRoot(adapter) {
  const envKey = `${adapter.harness.toUpperCase().replace(/-/g, '_')}_NATIVE_BRIDGE_ROOT`;
  return process.env[envKey] || adapter.defaultBridgeRoot || join(homedir(), '.grok', `${adapter.harness}-native`);
}

export function bridgeDir(adapter, id) {
  return join(bridgeRoot(adapter), id);
}

export function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function which(bin) {
  const r = spawnSync('sh', ['-lc', `command -v ${bin}`], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function tmux(socket, args) {
  const r = spawnSync('tmux', ['-L', socket, ...args], { encoding: 'utf8' });
  return {
    status: r.status ?? 1,
    stdout: (r.stdout ?? '').trim(),
    stderr: (r.stderr ?? '').trim(),
  };
}

export function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function acquireLock(dir) {
  const lockPath = join(dir, 'inject.lock');
  if (existsSync(lockPath)) {
    const age = Date.now() - statSync(lockPath).mtimeMs;
    if (age < LOCK_STALE_MS) return false;
    unlinkSync(lockPath);
  }
  writeFileSync(lockPath, `${process.pid}\n`);
  return true;
}

export function releaseLock(dir) {
  const lockPath = join(dir, 'inject.lock');
  if (existsSync(lockPath)) unlinkSync(lockPath);
}

export function loadBridge(adapter, id) {
  const dir = bridgeDir(adapter, id);
  if (!existsSync(dir)) throw new Error(`Bridge not found: ${id}`);
  return {
    dir,
    bridge: readJson(join(dir, 'bridge.json')),
    tmux: readJson(join(dir, 'tmux.json')),
    state: readJson(join(dir, 'state.json'), { phase: 'unknown' }),
  };
}

export function saveState(dir, state) {
  writeJson(join(dir, 'state.json'), state);
}

export function parseCommonArgs(argv) {
  const args = argv.slice(2);
  const cmd = args[0];
  const opts = { cmd };

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    switch (a) {
      case '--cwd':
        opts.cwd = next;
        i++;
        break;
      case '--prompt':
      case '-p':
        opts.prompt = next;
        i++;
        break;
      case '--resume':
        opts.resume = next;
        i++;
        break;
      case '--model':
      case '-m':
        opts.model = next;
        i++;
        break;
      case '--mode':
        opts.mode = next;
        i++;
        break;
      case '--id':
        opts.id = next;
        i++;
        break;
      case '--force':
        opts.force = true;
        break;
      case '--follow':
      case '-f':
        opts.follow = true;
        break;
      case '--mirror':
        opts.mirror = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--idle-ms':
        opts.idleMs = Number(next);
        i++;
        break;
      case '--write':
        opts.write = true;
        break;
      default:
        break;
    }
  }

  return opts;
}

function flattenMapped(mapped) {
  if (!mapped) return [];
  return Array.isArray(mapped) ? mapped : [mapped];
}

export function tailJsonlMirror({ dir, bridgeId, bridge, adapter, follow, mirror, json, idleMs, state }) {
  if (!state.jsonl_path || !existsSync(state.jsonl_path)) {
    throw new Error('jsonl_path missing; bridge still warming');
  }

  let offset = state.byte_offset ?? 0;
  let lastAssistantAt = 0;
  const eventsPath = join(dir, 'events.ndjson');
  const idle = idleMs ?? IDLE_MS;

  const emit = (ev) => {
    if (ev.type === 'assistant' || ev.type === 'tool_use') lastAssistantAt = Date.now();
    if (mirror) appendFileSync(eventsPath, `${JSON.stringify(ev)}\n`);
    if (json) console.log(JSON.stringify(ev));
    else if (ev.type === 'assistant' && ev.text) console.log(ev.text);
  };

  const readNew = () => {
    const buf = readFileSync(state.jsonl_path);
    if (buf.length <= offset) return;
    const chunk = buf.subarray(offset).toString('utf8');
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      for (const ev of flattenMapped(adapter.mapJsonlLine(line, bridgeId, bridge))) emit(ev);
      offset += Buffer.byteLength(`${line}\n`, 'utf8');
    }
    state.byte_offset = offset;
    state.last_event_at = new Date().toISOString();
    saveState(dir, state);
  };

  if (!follow) {
    readNew();
    return;
  }

  const deadline = Date.now() + FOLLOW_TIMEOUT_MS;
  while (Date.now() < deadline) {
    readNew();
    if (lastAssistantAt > 0 && Date.now() - lastAssistantAt >= idle) {
      state.phase = 'ready';
      saveState(dir, state);
      releaseLock(dir);
      return;
    }
    sleep(400);
  }

  throw new Error('tail follow timed out after 300s');
}

export function tailExportMirror({ dir, bridgeId, bridge, adapter, follow, mirror, json, idleMs, state }) {
  let lastAssistantAt = 0;
  const eventsPath = join(dir, 'events.ndjson');
  const idle = idleMs ?? IDLE_MS;
  const seen = new Set(state.seen_message_ids ?? []);

  const emit = (ev) => {
    if (ev.type === 'assistant' || ev.type === 'tool_use') lastAssistantAt = Date.now();
    if (mirror) appendFileSync(eventsPath, `${JSON.stringify(ev)}\n`);
    if (json) console.log(JSON.stringify(ev));
    else if (ev.type === 'assistant' && ev.text) console.log(ev.text);
  };

  const poll = () => {
    const events = adapter.pollExport(bridge, state) ?? [];
    for (const ev of events) {
      const key = ev._dedupe ?? JSON.stringify(ev);
      if (seen.has(key)) continue;
      seen.add(key);
      const { _dedupe, ...out } = ev;
      emit(out);
    }
    state.seen_message_ids = [...seen];
    state.last_event_at = new Date().toISOString();
    saveState(dir, state);
  };

  if (!follow) {
    poll();
    return;
  }

  const deadline = Date.now() + FOLLOW_TIMEOUT_MS;
  while (Date.now() < deadline) {
    poll();
    if (lastAssistantAt > 0 && Date.now() - lastAssistantAt >= idle) {
      state.phase = 'ready';
      saveState(dir, state);
      releaseLock(dir);
      return;
    }
    sleep(600);
  }

  throw new Error('tail follow timed out after 300s');
}

export function cmdLaunch(adapter, opts) {
  opts = applyHarnessDefaults(adapter.harness, opts);

  if (!which('tmux')) {
    console.error('tmux not found');
    process.exit(127);
  }
  const cli = adapter.cliBin;
  if (!which(cli)) {
    console.error(`${cli} not found in PATH`);
    process.exit(127);
  }

  let launchMeta = {};
  try {
    launchMeta = adapter.prepareLaunch?.(opts) ?? {};
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }

  const id = opts.id || randomBytes(4).toString('hex');
  const cwd = resolve(opts.cwd || process.cwd());
  const dir = bridgeDir(adapter, id);
  mkdirSync(dir, { recursive: true });

  const session = `${adapter.harness}-${id}`;
  const target = `${session}:0.0`;
  const socket = adapter.tmuxSocket || 'harness-native';
  const before = adapter.snapshotSessions(cwd);
  const t0 = Date.now();

  const bridgeRecord = {
    id,
    harness: adapter.harness,
    cwd,
    model: launchMeta.model ?? opts.model ?? null,
    agent_mode: launchMeta.agentMode ?? opts.mode ?? null,
    created_at: new Date().toISOString(),
    initial_prompt: opts.prompt ?? null,
    resume: opts.resume ?? null,
    thread_id: launchMeta.threadId ?? null,
    ...launchMeta.extra,
  };

  writeJson(join(dir, 'bridge.json'), bridgeRecord);
  writeJson(join(dir, 'tmux.json'), { socket, session, target });

  saveState(dir, {
    phase: 'launching',
    session_id: launchMeta.sessionId ?? null,
    jsonl_path: null,
    mirror_type: adapter.mirrorType ?? 'jsonl',
    byte_offset: 0,
    seen_message_ids: [],
    last_inject_at: null,
    last_event_at: null,
    error: null,
  });

  const { bin, args } = adapter.buildLaunchCommand({ ...opts, cwd }, bridgeRecord, launchMeta);
  const launch = tmux(socket, ['new-session', '-d', '-s', session, '-c', cwd, '--', bin, ...args]);
  if (launch.status !== 0) {
    saveState(dir, { ...loadBridge(adapter, id).state, phase: 'error', error: launch.stderr });
    console.error(launch.stderr || 'tmux new-session failed');
    process.exit(1);
  }

  saveState(dir, { ...loadBridge(adapter, id).state, phase: 'warming' });

  let resolvedSession = launchMeta.preResolved ?? null;
  const deadline = Date.now() + (adapter.warmTimeoutMs ?? WARM_TIMEOUT_MS);
  while (!resolvedSession && Date.now() < deadline) {
    resolvedSession = adapter.findSession(cwd, before, t0, bridgeRecord);
    if (!resolvedSession) sleep(500);
  }

  if (!resolvedSession && adapter.mirrorType === 'export') {
    resolvedSession = { session_id: bridgeRecord.thread_id, mirror_type: 'export' };
  }

  if (!resolvedSession) {
    saveState(dir, {
      ...loadBridge(adapter, id).state,
      phase: 'error',
      error: 'session mirror not discovered within timeout',
    });
    console.error(`Could not discover ${adapter.harness} session. Attach with: attach --id`, id);
    process.exit(2);
  }

  saveState(dir, {
    phase: 'ready',
    session_id: resolvedSession.session_id,
    jsonl_path: resolvedSession.jsonl_path ?? null,
    mirror_type: resolvedSession.mirror_type ?? adapter.mirrorType ?? 'jsonl',
    byte_offset: 0,
    seen_message_ids: [],
    last_inject_at: opts.prompt ? new Date().toISOString() : null,
    last_event_at: null,
    error: null,
  });

  if (
    resolvedSession.thread_id ||
    resolvedSession.thread_url ||
    resolvedSession.headless_pid ||
    resolvedSession.pid_file
  ) {
    const current = readJson(join(dir, 'bridge.json'));
    writeJson(join(dir, 'bridge.json'), {
      ...current,
      thread_id: resolvedSession.thread_id ?? current.thread_id,
      thread_url: resolvedSession.thread_url ?? current.thread_url,
      headless_pid: resolvedSession.headless_pid ?? current.headless_pid,
      pid_file: resolvedSession.pid_file ?? current.pid_file,
    });
    bridgeRecord.thread_id = resolvedSession.thread_id ?? bridgeRecord.thread_id;
    bridgeRecord.thread_url = resolvedSession.thread_url ?? bridgeRecord.thread_url;
    bridgeRecord.headless_pid = resolvedSession.headless_pid ?? bridgeRecord.headless_pid;
    bridgeRecord.pid_file = resolvedSession.pid_file ?? bridgeRecord.pid_file;
  }

  if (opts.prompt && adapter.postLaunchInject && !launchMeta.promptPreInjected) {
    sleep(adapter.postLaunchDelayMs ?? 2000);
    const loaded = loadBridge(adapter, id);
    if (adapter.inject) {
      try {
        adapter.inject({ bridge: loaded.bridge, dir, state: loaded.state, prompt: opts.prompt, opts });
      } catch (err) {
        saveState(dir, { ...loaded.state, phase: 'error', error: err.message });
        console.error(err.message);
        process.exit(1);
      }
    } else {
      const send = tmux(socket, ['send-keys', '-t', target, '-l', '--', opts.prompt]);
      if (send.status === 0) tmux(socket, ['send-keys', '-t', target, 'Enter']);
    }
    saveState(dir, {
      ...loadBridge(adapter, id).state,
      last_inject_at: new Date().toISOString(),
    });
  }

  const out = {
    ok: true,
    id,
    harness: adapter.harness,
    model: bridgeRecord.model,
    session_id: resolvedSession.session_id,
    thread_id: bridgeRecord.thread_id ?? resolvedSession.thread_id ?? undefined,
    thread_url: bridgeRecord.thread_url ?? resolvedSession.thread_url ?? undefined,
    target,
  };
  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    const url = out.thread_url ? ` → ${out.thread_url}` : '';
    console.log(`launched ${adapter.harness} bridge ${id}${url}`);
  }
}

export function cmdInject(adapter, opts) {
  if (!opts.id || !opts.prompt) {
    console.error('--id and --prompt required');
    process.exit(2);
  }

  const { dir, bridge, tmux: tm, state } = loadBridge(adapter, opts.id);

  if (state.phase === 'busy' && !opts.force) {
    console.error('bridge busy; retry later or use --force');
    process.exit(3);
  }

  if (!acquireLock(dir)) {
    console.error('inject lock held');
    process.exit(3);
  }

  saveState(dir, { ...state, phase: 'busy', last_inject_at: new Date().toISOString() });

  if (adapter.inject) {
    try {
      adapter.inject({ bridge, dir, state, prompt: opts.prompt, opts });
      console.log(opts.json ? JSON.stringify({ ok: true, id: opts.id }, null, 2) : `injected into ${opts.id}`);
      return;
    } catch (err) {
      releaseLock(dir);
      saveState(dir, { ...loadBridge(adapter, opts.id).state, phase: 'error', error: err.message });
      console.error(err.message);
      process.exit(1);
    }
  }

  const send = tmux(tm.socket, ['send-keys', '-t', tm.target, '-l', '--', opts.prompt]);
  if (send.status !== 0) {
    releaseLock(dir);
    saveState(dir, { ...loadBridge(adapter, opts.id).state, phase: 'error', error: send.stderr });
    console.error(send.stderr);
    process.exit(1);
  }
  tmux(tm.socket, ['send-keys', '-t', tm.target, 'Enter']);

  console.log(opts.json ? JSON.stringify({ ok: true, id: opts.id }, null, 2) : `injected into ${opts.id}`);
}

export function cmdTail(adapter, opts) {
  if (!opts.id) {
    console.error('--id required');
    process.exit(2);
  }
  const { dir, bridge, state } = loadBridge(adapter, opts.id);

  if (adapter.tail) {
    adapter.tail({ dir, bridgeId: opts.id, bridge, follow: opts.follow, mirror: opts.mirror, json: opts.json, idleMs: opts.idleMs, state });
    return;
  }

  if ((state.mirror_type ?? adapter.mirrorType) === 'export') {
    tailExportMirror({
      dir,
      bridgeId: opts.id,
      bridge,
      adapter,
      follow: opts.follow,
      mirror: opts.mirror,
      json: opts.json,
      idleMs: opts.idleMs,
      state,
    });
    return;
  }

  tailJsonlMirror({
    dir,
    bridgeId: opts.id,
    bridge,
    adapter,
    follow: opts.follow,
    mirror: opts.mirror,
    json: opts.json,
    idleMs: opts.idleMs,
    state,
  });
}

export function cmdStatus(adapter, opts) {
  const root = bridgeRoot(adapter);
  if (!opts.id) {
    if (!existsSync(root)) {
      console.log('no bridges');
      return;
    }
    const ids = readdirSync(root).filter((d) => existsSync(join(root, d, 'bridge.json')));
    for (const id of ids) {
      const { bridge, state, tmux: tm } = loadBridge(adapter, id);
      console.log(`${id}\t${state.phase}\t${bridge.model ?? '-'}\t${bridge.cwd}\t${tm.session}`);
    }
    return;
  }

  console.log(JSON.stringify(loadBridge(adapter, opts.id), null, 2));
}

export function cmdAttach(adapter, opts) {
  if (!opts.id) {
    console.error('--id required');
    process.exit(2);
  }
  const { tmux: tm } = loadBridge(adapter, opts.id);
  const r = spawnSync('tmux', ['-L', tm.socket, 'attach', '-t', tm.session], { stdio: 'inherit' });
  process.exit(r.status ?? 0);
}

export function cmdStop(adapter, opts) {
  if (!opts.id) {
    console.error('--id required');
    process.exit(2);
  }
  const { dir, bridge, tmux: tm, state } = loadBridge(adapter, opts.id);
  tmux(tm.socket, ['kill-session', '-t', tm.session]);
  adapter.stopBridge?.({ bridge, dir, state });
  releaseLock(dir);
  saveState(dir, { ...state, phase: 'stopped' });
  console.log(opts.json ? JSON.stringify({ ok: true, id: opts.id }, null, 2) : `stopped ${opts.id}`);
}

export function runBridgeCli(adapter, argv, usageText) {
  if (argv.includes('--help') || argv.includes('-h') || argv.length <= 2) {
    console.log(usageText);
    process.exit(argv.length <= 2 ? 2 : 0);
  }

  const opts = parseCommonArgs(argv);
  if (!opts.cmd) {
    console.log(usageText);
    process.exit(2);
  }

  try {
    switch (opts.cmd) {
      case 'launch':
        cmdLaunch(adapter, opts);
        break;
      case 'models':
        adapter.cmdModels?.(opts);
        break;
      case 'inject':
        cmdInject(adapter, opts);
        break;
      case 'tail':
        cmdTail(adapter, opts);
        break;
      case 'status':
        cmdStatus(adapter, opts);
        break;
      case 'attach':
        cmdAttach(adapter, opts);
        break;
      case 'stop':
        cmdStop(adapter, opts);
        break;
      default:
        console.error(`unknown command: ${opts.cmd}`);
        console.log(usageText);
        process.exit(2);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}