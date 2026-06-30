/**
 * Per-harness adapters for native tmux bridges.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { listZenGoModels, resolveZenGoModel } from './droid-model-resolver.mjs';
import { writeJson } from './native-bridge-core.mjs';

const CODEX_SESSIONS = join(homedir(), '.codex', 'sessions');
const CLAUDE_PROJECTS = join(homedir(), '.claude', 'projects');
const GROK_SESSIONS = join(homedir(), '.grok', 'sessions');
const FACTORY_SESSIONS = join(homedir(), '.factory', 'sessions');
const AMP_PIDS_DIR = join(homedir(), '.cache', 'amp', 'pids');
const AMP_THREAD_BASE = 'https://ampcode.com/threads';
const AGY_HOME = join(homedir(), '.gemini', 'antigravity-cli');
const AGY_BRAIN = join(AGY_HOME, 'brain');
const AGY_LAST_CONVERSATIONS = join(AGY_HOME, 'cache', 'last_conversations.json');

function listJsonlFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      try {
        const st = statSync(p);
        if (st.isDirectory()) walk(p);
        else if (name.endsWith('.jsonl')) out.push(p);
      } catch {
        /* ignore */
      }
    }
  };
  walk(dir);
  return out;
}

function encodeClaudeCwd(cwd) {
  return cwd.replace(/\//g, '-');
}

function encodeGrokCwd(cwd) {
  const abs = cwd.startsWith('/') ? cwd : `/${cwd}`;
  return encodeURIComponent(abs);
}

function encodeFactoryCwd(cwd) {
  return `-${cwd.replace(/\//g, '-')}`;
}

function snapshotMtimes(paths) {
  const snap = new Map();
  for (const p of paths) {
    try {
      snap.set(p, statSync(p).mtimeMs);
    } catch {
      /* ignore */
    }
  }
  return snap;
}

function eventBase(bridgeId, bridge, source) {
  return {
    bridge: bridgeId,
    source,
    model: bridge.model ?? undefined,
    ts: new Date().toISOString(),
  };
}

function runCapture(bin, args, { cwd } = {}) {
  const r = spawnSync(bin, args, { cwd, encoding: 'utf8' });
  return {
    status: r.status ?? 1,
    stdout: (r.stdout ?? '').trim(),
    stderr: (r.stderr ?? '').trim(),
  };
}

export function droidAutonomyForMode(mode, write) {
  if (mode === 'low') return 'auto-low';
  if (mode === 'medium') return 'auto-medium';
  if (mode === 'high') return 'auto-high';
  if (write) return 'auto-high';
  return 'auto-medium';
}

function writeDroidRuntimeSettings(droidModel, { mode, write } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'droid-bridge-settings-'));
  const path = join(dir, 'settings.json');
  writeJson(path, {
    sessionDefaultSettings: {
      model: droidModel,
      autonomyMode: droidAutonomyForMode(mode, write),
    },
  });
  return path;
}

function extractDroidText(message) {
  const parts = [];
  for (const block of message?.content ?? []) {
    if (block.type === 'text' && block.text) {
      const t = block.text.trim();
      if (t && !t.startsWith('<system-reminder>')) parts.push(t);
    }
  }
  return parts.join('\n').trim();
}

function listAmpPidFiles() {
  if (!existsSync(AMP_PIDS_DIR)) return [];
  return readdirSync(AMP_PIDS_DIR)
    .filter((name) => name.startsWith('T-') && name.endsWith('.pid'))
    .map((name) => join(AMP_PIDS_DIR, name));
}

function threadIdFromPidFile(path) {
  const name = path.split('/').pop();
  return name?.replace(/\.pid$/, '') ?? null;
}

function ampThreadUrl(threadId) {
  return threadId ? `${AMP_THREAD_BASE}/${threadId}` : null;
}

function ampModeArgs(mode) {
  return mode && ['deep', 'rush', 'smart'].includes(mode) ? ['-m', mode] : [];
}

function isProcessAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readHeadlessPid(threadId) {
  if (!threadId) return null;
  const pidFile = join(AMP_PIDS_DIR, `${threadId}.pid`);
  if (!existsSync(pidFile)) return null;
  try {
    const pid = Number.parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function isAmpHeadlessAlive(bridge) {
  const pid = bridge.headless_pid ?? readHeadlessPid(bridge.thread_id);
  return isProcessAlive(pid);
}

function mapAmpExport(thread, bridgeId, bridge) {
  const events = [];
  const base = eventBase(bridgeId, bridge, bridge.harness ?? 'amp');
  for (const msg of thread.messages ?? []) {
    const msgKey = msg.protocolMessageID ?? `msg-${msg.messageId}`;
    if (msg.role === 'user') {
      const text = (msg.content ?? [])
        .filter((b) => b.type === 'text' && b.text)
        .map((b) => b.text.trim())
        .join('\n');
      if (text) events.push({ ...base, type: 'user', text, _dedupe: `${msgKey}:user` });
    }
    if (msg.role === 'assistant') {
      for (const block of msg.content ?? []) {
        if (block.type === 'text' && block.text?.trim()) {
          events.push({
            ...base,
            type: 'assistant',
            text: block.text.trim(),
            _dedupe: `${msgKey}:text:${block.text.length}`,
          });
        }
        if (block.type === 'tool_use' && block.name) {
          events.push({
            ...base,
            type: 'tool_use',
            name: block.name,
            input: block.input,
            _dedupe: `${msgKey}:tool:${block.id ?? block.name}`,
          });
        }
      }
    }
  }
  return events;
}

export const codexAdapter = {
  harness: 'codex',
  cliBin: 'codex',
  tmuxSocket: 'harness-native',
  defaultBridgeRoot: join(homedir(), '.grok', 'codex-native'),
  mirrorType: 'jsonl',

  snapshotSessions(cwd) {
    return snapshotMtimes(listJsonlFiles(CODEX_SESSIONS));
  },

  findSession(cwd, before, sinceMs) {
    const candidates = listJsonlFiles(CODEX_SESSIONS)
      .filter((p) => {
        try {
          const st = statSync(p);
          const isNew = !before.has(p) || st.mtimeMs > (before.get(p) ?? 0) + 50;
          return isNew && st.mtimeMs >= sinceMs - 2000;
        } catch {
          return false;
        }
      })
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

    for (const p of candidates) {
      try {
        const first = readFileSync(p, 'utf8').split('\n')[0];
        if (!first) continue;
        const row = JSON.parse(first);
        if (row.type === 'session_meta' && row.payload?.cwd === cwd && row.payload?.id) {
          return { session_id: row.payload.id, jsonl_path: p, mirror_type: 'jsonl' };
        }
      } catch {
        continue;
      }
    }
    return null;
  },

  buildLaunchCommand(opts, bridge) {
    // Codex's working-root flag is `-C, --cd` (not `--cwd`). Global options come before the
    // subcommand; the prompt is the resume positional.
    const args = ['--cd', opts.cwd];
    if (bridge.model) args.push('-m', bridge.model);
    if (bridge.agent_mode === 'xhigh') args.push('-c', 'model_reasoning_effort="xhigh"');
    if (opts.resume === 'last' || opts.resume === true) {
      const resumeArgs = [...args, 'resume', '--last'];
      if (opts.prompt) resumeArgs.push(opts.prompt);
      return { bin: 'codex', args: resumeArgs };
    }
    if (opts.prompt) args.push(opts.prompt);
    return { bin: 'codex', args };
  },

  mapJsonlLine(line, bridgeId, bridge) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      return null;
    }
    const base = eventBase(bridgeId, bridge, 'codex');

    if (row.type === 'session_meta') {
      return { ...base, type: 'session_start', session_id: row.payload?.id };
    }

    if (row.type === 'response_item' && row.payload?.type === 'message') {
      const role = row.payload.role;
      if (role === 'user') {
        const text = (row.payload.content ?? [])
          .filter((b) => b.type === 'input_text' && b.text)
          .map((b) => b.text.trim())
          .filter((t) => t && !t.startsWith('<environment_context>'))
          .join('\n');
        if (!text) return null;
        return { ...base, type: 'user', text };
      }
      if (role === 'assistant') {
        const events = [];
        for (const block of row.payload.content ?? []) {
          if (block.type === 'output_text' && block.text?.trim()) {
            events.push({ ...base, type: 'assistant', text: block.text.trim() });
          }
        }
        return events.length ? events : null;
      }
    }

    return null;
  },
};

export const claudeAdapter = {
  harness: 'claude',
  cliBin: 'claude',
  tmuxSocket: 'harness-native',
  defaultBridgeRoot: join(homedir(), '.grok', 'claude-native'),
  mirrorType: 'jsonl',

  snapshotSessions(cwd) {
    const scoped = join(CLAUDE_PROJECTS, encodeClaudeCwd(cwd));
    return snapshotMtimes(listJsonlFiles(scoped));
  },

  findSession(cwd, before, sinceMs) {
    const scoped = join(CLAUDE_PROJECTS, encodeClaudeCwd(cwd));
    const candidates = listJsonlFiles(scoped)
      .filter((p) => !p.includes('/subagents/'))
      .filter((p) => {
        try {
          const st = statSync(p);
          const isNew = !before.has(p) || st.mtimeMs > (before.get(p) ?? 0) + 50;
          return isNew && st.mtimeMs >= sinceMs - 2000;
        } catch {
          return false;
        }
      })
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

    for (const p of candidates) {
      try {
        const head = readFileSync(p, 'utf8').split('\n').slice(0, 5);
        for (const line of head) {
          if (!line.trim()) continue;
          const row = JSON.parse(line);
          const sid = row.sessionId ?? row.session_id;
          if (sid) return { session_id: sid, jsonl_path: p, mirror_type: 'jsonl' };
        }
        const sessionId = p.split('/').pop()?.replace('.jsonl', '');
        if (sessionId) return { session_id: sessionId, jsonl_path: p, mirror_type: 'jsonl' };
      } catch {
        continue;
      }
    }
    return null;
  },

  buildLaunchCommand(opts, bridge) {
    const args = [];
    if (bridge.model) args.push('--model', bridge.model);
    if (opts.write) args.push('--dangerously-skip-permissions');
    if (opts.resume === 'last' || opts.resume === true) args.push('-c');
    if (opts.prompt) args.push(opts.prompt);
    return { bin: 'claude', args };
  },

  mapJsonlLine(line, bridgeId, bridge) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      return null;
    }
    const base = eventBase(bridgeId, bridge, 'claude');

    if (row.type === 'assistant' && row.message?.role === 'assistant') {
      const events = [];
      for (const block of row.message.content ?? []) {
        if (block.type === 'text' && block.text?.trim()) {
          events.push({ ...base, type: 'assistant', text: block.text.trim() });
        }
        if (block.type === 'tool_use' && block.name) {
          events.push({ ...base, type: 'tool_use', name: block.name, input: block.input });
        }
      }
      return events.length ? events : null;
    }

    if (row.type === 'user' && row.message?.role === 'user' && !row.isMeta) {
      const content = row.message.content;
      let text = '';
      if (typeof content === 'string') text = content.trim();
      else if (Array.isArray(content)) {
        text = content
          .filter((b) => b.type === 'text' && b.text)
          .map((b) => b.text.trim())
          .join('\n');
      }
      if (!text || text.startsWith('<local-command') || text.startsWith('<command-name>')) return null;
      return { ...base, type: 'user', text };
    }

    return null;
  },
};

export const grokAdapter = {
  harness: 'grok',
  cliBin: 'grok',
  tmuxSocket: 'harness-native',
  defaultBridgeRoot: join(homedir(), '.grok', 'grok-native'),
  mirrorType: 'jsonl',

  snapshotSessions(cwd) {
    const scoped = join(GROK_SESSIONS, encodeGrokCwd(cwd));
    if (!existsSync(scoped)) return new Map();
    const paths = [];
    for (const dir of readdirSync(scoped)) {
      const hist = join(scoped, dir, 'chat_history.jsonl');
      if (existsSync(hist)) paths.push(hist);
    }
    return snapshotMtimes(paths);
  },

  findSession(cwd, before, sinceMs) {
    const scoped = join(GROK_SESSIONS, encodeGrokCwd(cwd));
    if (!existsSync(scoped)) return null;

    const candidates = readdirSync(scoped)
      .map((dir) => {
        const hist = join(scoped, dir, 'chat_history.jsonl');
        if (!existsSync(hist)) return null;
        try {
          const st = statSync(hist);
          const isNew = !before.has(hist) || st.mtimeMs > (before.get(hist) ?? 0) + 50;
          if (!isNew || st.mtimeMs < sinceMs - 2000) return null;
          return { session_id: dir, jsonl_path: hist, mtime: st.mtimeMs };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);

    if (!candidates.length) return null;
    const top = candidates[0];
    return { session_id: top.session_id, jsonl_path: top.jsonl_path, mirror_type: 'jsonl' };
  },

  buildLaunchCommand(opts, bridge) {
    const args = ['--cwd', opts.cwd];
    if (bridge.model) args.push('-m', bridge.model);
    if (opts.resume === 'last' || opts.resume === true) args.push('-c');
    if (opts.prompt) args.push(opts.prompt);
    return { bin: 'grok', args };
  },

  mapJsonlLine(line, bridgeId, bridge) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      return null;
    }
    const base = eventBase(bridgeId, bridge, 'grok');

    if (row.type === 'user') {
      const content = row.content;
      let text = '';
      if (typeof content === 'string') text = content.trim();
      else if (Array.isArray(content)) {
        text = content
          .filter((b) => b.type === 'text' && b.text)
          .map((b) => b.text.trim())
          .join('\n');
      }
      if (!text || text.includes('<user_info>') && text.includes('<agent_skills>')) return null;
      if (text.startsWith('<user_query>')) {
        const m = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
        text = m ? m[1].trim() : text;
      }
      if (!text) return null;
      return { ...base, type: 'user', text };
    }

    if (row.type === 'assistant') {
      const events = [];
      if (typeof row.content === 'string' && row.content.trim()) {
        events.push({ ...base, type: 'assistant', text: row.content.trim() });
      }
      if (Array.isArray(row.tool_calls)) {
        for (const tc of row.tool_calls) {
          if (tc.name) events.push({ ...base, type: 'tool_use', name: tc.name, input: tc.arguments });
        }
      }
      return events.length ? events : null;
    }

    return null;
  },
};

const ampAdapterCore = {
  cliBin: 'amp',
  tmuxSocket: 'harness-native',
  mirrorType: 'export',
  warmTimeoutMs: 20_000,
  postLaunchInject: true,
  postLaunchDelayMs: 4000,

  prepareLaunch(opts) {
    if (opts.resume === 'last' || opts.resume === true) {
      const listed = runCapture('amp', ['threads', 'list', '--limit', '1'], { cwd: opts.cwd });
      if (listed.status !== 0 || !listed.stdout) {
        throw new Error(listed.stderr || 'amp threads list failed');
      }
      const match = listed.stdout.match(/T-[0-9a-f-]+/i);
      if (!match) throw new Error('no thread to resume');
      const threadId = match[0];
      return {
        threadId,
        preResolved: {
          session_id: threadId,
          thread_id: threadId,
          thread_url: ampThreadUrl(threadId),
          mirror_type: 'export',
        },
        extra: { thread_id: threadId, thread_url: ampThreadUrl(threadId) },
      };
    }

    if (opts.prompt) {
      const created = runCapture('amp', ['threads', 'new'], { cwd: opts.cwd });
      if (created.status !== 0 || !created.stdout) {
        throw new Error(created.stderr || 'amp threads new failed');
      }
      const threadId = created.stdout.split('\n')[0].trim();
      const execArgs = ['threads', 'continue', threadId, ...ampModeArgs(opts.mode), '-x', opts.prompt];
      const injected = runCapture('amp', execArgs, { cwd: opts.cwd });
      if (injected.status !== 0) {
        throw new Error(injected.stderr || injected.stdout || 'amp threads continue -x failed');
      }
      return {
        threadId,
        promptPreInjected: true,
        preResolved: {
          session_id: threadId,
          thread_id: threadId,
          thread_url: ampThreadUrl(threadId),
          mirror_type: 'export',
        },
        extra: { thread_id: threadId, thread_url: ampThreadUrl(threadId) },
      };
    }

    return {};
  },

  snapshotSessions() {
    return snapshotMtimes(listAmpPidFiles());
  },

  findSession(_cwd, before, sinceMs) {
    const candidates = listAmpPidFiles()
      .filter((p) => {
        try {
          const st = statSync(p);
          const isNew = !before.has(p) || st.mtimeMs > (before.get(p) ?? 0) + 50;
          return isNew && st.mtimeMs >= sinceMs - 2000;
        } catch {
          return false;
        }
      })
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

    if (!candidates.length) return null;

    const pidFile = candidates[0];
    const threadId = threadIdFromPidFile(pidFile);
    if (!threadId) return null;

    let headlessPid = null;
    try {
      headlessPid = Number.parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
    } catch {
      /* ignore */
    }

    return {
      session_id: threadId,
      thread_id: threadId,
      thread_url: ampThreadUrl(threadId),
      mirror_type: 'export',
      headless_pid: Number.isFinite(headlessPid) ? headlessPid : null,
      pid_file: pidFile,
    };
  },

  buildLaunchCommand(opts, bridge, launchMeta) {
    const mode = bridge.agent_mode ?? opts.mode;
    const modeArgs = ampModeArgs(mode);
    const threadId = launchMeta?.threadId ?? bridge.thread_id;

    if (threadId && threadId !== 'last') {
      return { bin: 'amp', args: ['--headless', threadId, ...modeArgs] };
    }

    return { bin: 'amp', args: ['--headless', ...modeArgs] };
  },

  resolveThreadId(bridge) {
    if (bridge.thread_id && bridge.thread_id !== 'last') return bridge.thread_id;
    const listed = runCapture('amp', ['threads', 'list', '--limit', '1'], { cwd: bridge.cwd });
    if (listed.status !== 0 || !listed.stdout) return null;
    const match = listed.stdout.match(/T-[0-9a-f-]+/i);
    return match?.[0] ?? null;
  },

  inject({ bridge, prompt }) {
    const threadId = this.resolveThreadId(bridge);
    if (!threadId) throw new Error('thread_id missing for amp inject');
    if (isAmpHeadlessAlive(bridge)) {
      const url = bridge.thread_url ?? ampThreadUrl(threadId);
      throw new Error(
        `headless executor is running for ${threadId}. Send follow-ups via web: ${url} (CLI inject conflicts with active headless)`,
      );
    }
    const r = runCapture('amp', ['threads', 'continue', threadId, '-x', prompt], { cwd: bridge.cwd });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'amp threads continue -x failed');
  },

  pollExport(bridge, bridgeId) {
    const threadId = this.resolveThreadId(bridge);
    if (!threadId) return [];
    if (!bridge.thread_id || bridge.thread_id === 'last') bridge.thread_id = threadId;
    const r = runCapture('amp', ['threads', 'export', threadId], { cwd: bridge.cwd });
    if (r.status !== 0 || !r.stdout) return [];
    try {
      const thread = JSON.parse(r.stdout);
      return mapAmpExport(thread, bridgeId ?? bridge.id, bridge);
    } catch {
      return [];
    }
  },

  stopBridge({ bridge }) {
    const pid = bridge.headless_pid ?? readHeadlessPid(bridge.thread_id);
    if (isProcessAlive(pid)) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* ignore */
      }
    }
  },
};

export const ampAdapter = {
  ...ampAdapterCore,
  harness: 'amp',
  defaultBridgeRoot: join(homedir(), '.grok', 'amp-native'),

  pollExport(bridge) {
    return ampAdapterCore.pollExport(bridge, bridge.id);
  },
};

function readAgyLastConversations() {
  if (!existsSync(AGY_LAST_CONVERSATIONS)) return {};
  try {
    return JSON.parse(readFileSync(AGY_LAST_CONVERSATIONS, 'utf8'));
  } catch {
    return {};
  }
}

function agyConversationForCwd(cwd) {
  const map = readAgyLastConversations();
  const abs = cwd.startsWith('/') ? cwd : resolve(cwd);
  return map[abs] ?? map[cwd] ?? null;
}

function agyTranscriptPath(conversationId) {
  return join(AGY_BRAIN, conversationId, '.system_generated', 'logs', 'transcript.jsonl');
}

function listAgyTranscriptPaths() {
  if (!existsSync(AGY_BRAIN)) return [];
  const out = [];
  for (const id of readdirSync(AGY_BRAIN)) {
    const p = agyTranscriptPath(id);
    if (existsSync(p)) out.push(p);
  }
  return out;
}

function extractAgyUserRequest(content) {
  if (!content) return null;
  const m = content.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
  return m?.[1]?.trim() ?? null;
}

/** Google Antigravity CLI (`agy`) — separate harness from Ampcode (`amp`). */
export const agyAdapter = {
  harness: 'agy',
  cliBin: 'agy',
  tmuxSocket: 'harness-native',
  defaultBridgeRoot: join(homedir(), '.grok', 'agy-native'),
  mirrorType: 'jsonl',

  prepareLaunch(opts) {
    if (opts.resume === 'last' || opts.resume === true) {
      const conversationId = agyConversationForCwd(opts.cwd);
      if (conversationId) {
        const jsonl_path = agyTranscriptPath(conversationId);
        return {
          preResolved: {
            session_id: conversationId,
            jsonl_path: existsSync(jsonl_path) ? jsonl_path : null,
            mirror_type: 'jsonl',
            conversation_id: conversationId,
          },
          extra: { conversation_id: conversationId },
        };
      }
    }
    if (opts.resume && opts.resume !== 'last') {
      const jsonl_path = agyTranscriptPath(opts.resume);
      return {
        preResolved: {
          session_id: opts.resume,
          jsonl_path: existsSync(jsonl_path) ? jsonl_path : null,
          mirror_type: 'jsonl',
          conversation_id: opts.resume,
        },
        extra: { conversation_id: opts.resume },
      };
    }
    return {};
  },

  snapshotSessions(cwd) {
    return snapshotMtimes(listAgyTranscriptPaths());
  },

  findSession(cwd, before, sinceMs) {
    const knownId = agyConversationForCwd(cwd);
    if (knownId) {
      const jsonl_path = agyTranscriptPath(knownId);
      if (existsSync(jsonl_path)) {
        try {
          const st = statSync(jsonl_path);
          const isNew = !before.has(jsonl_path) || st.mtimeMs > (before.get(jsonl_path) ?? 0) + 50;
          if (isNew && st.mtimeMs >= sinceMs - 5000) {
            return {
              session_id: knownId,
              jsonl_path,
              mirror_type: 'jsonl',
              conversation_id: knownId,
            };
          }
        } catch {
          /* ignore */
        }
      }
    }

    const candidates = listAgyTranscriptPaths()
      .filter((p) => {
        try {
          const st = statSync(p);
          const isNew = !before.has(p) || st.mtimeMs > (before.get(p) ?? 0) + 50;
          return isNew && st.mtimeMs >= sinceMs - 5000;
        } catch {
          return false;
        }
      })
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

    if (!candidates.length) return null;
    const jsonl_path = candidates[0];
    const conversationId = jsonl_path.split('/brain/')[1]?.split('/')[0] ?? null;
    return {
      session_id: conversationId,
      jsonl_path,
      mirror_type: 'jsonl',
      conversation_id: conversationId,
    };
  },

  buildLaunchCommand(opts, bridge) {
    const args = [];
    if (bridge.model) args.push('--model', bridge.model);
    if (opts.write) args.push('--dangerously-skip-permissions');
    if (opts.resume === 'last' || opts.resume === true) {
      args.push('-c');
      return { bin: 'agy', args };
    }
    if (opts.resume && opts.resume !== 'last') {
      args.push('--conversation', String(opts.resume));
      return { bin: 'agy', args };
    }
    if (opts.prompt) args.push('-i', opts.prompt);
    return { bin: 'agy', args };
  },

  cmdModels(opts) {
    const r = runCapture('agy', ['models']);
    if (r.status !== 0) {
      console.error(r.stderr || 'agy models failed');
      process.exit(1);
    }
    const models = r.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    if (opts.json) {
      console.log(JSON.stringify(models, null, 2));
      return;
    }
    for (const m of models) console.log(m);
  },

  mapJsonlLine(line, bridgeId, bridge) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      return null;
    }
    const base = eventBase(bridgeId, bridge, 'agy');
    const key = `step-${row.step_index ?? 0}:${row.type ?? 'unknown'}`;

    if (row.type === 'USER_INPUT') {
      const text = extractAgyUserRequest(row.content);
      if (!text) return null;
      return { ...base, type: 'user', text, _dedupe: `${key}:user` };
    }

    if (row.type === 'PLANNER_RESPONSE' && row.source === 'MODEL') {
      const events = [];
      for (const tc of row.tool_calls ?? []) {
        if (tc.name) {
          events.push({
            ...base,
            type: 'tool_use',
            name: tc.name,
            input: tc.args,
            _dedupe: `${key}:tool:${tc.name}`,
          });
        }
      }
      const text = row.content?.trim();
      if (text) {
        events.push({ ...base, type: 'assistant', text, _dedupe: `${key}:assistant` });
      }
      return events.length ? events : null;
    }

    return null;
  },
};

export const droidAdapter = {
  harness: 'droid',
  cliBin: 'droid',
  tmuxSocket: 'droid-native',
  defaultBridgeRoot: join(homedir(), '.grok', 'droid-native'),
  mirrorType: 'jsonl',

  prepareLaunch(opts) {
    const resolved = resolveZenGoModel(opts.model);
    const settingsPath = writeDroidRuntimeSettings(resolved.droidModel, {
      mode: opts.mode,
      write: opts.write,
    });
    return {
      model: resolved.opencodeGo,
      droidModel: resolved.droidModel,
      settingsPath,
      extra: { droid_model: resolved.droidModel, settings_path: settingsPath },
    };
  },

  cmdModels(opts) {
    const models = listZenGoModels();
    if (opts.json) {
      console.log(JSON.stringify(models, null, 2));
      return;
    }
    for (const m of models) {
      console.log(`${m.opencodeGo} | ${m.droidId ?? '-'} | ${m.displayName ?? m.modelId}`);
    }
  },

  snapshotSessions(cwd) {
    const scoped = join(FACTORY_SESSIONS, encodeFactoryCwd(cwd));
    const paths = [...listJsonlFiles(scoped), ...listJsonlFiles(FACTORY_SESSIONS)];
    return snapshotMtimes(paths);
  },

  findSession(cwd, before, sinceMs) {
    const scoped = join(FACTORY_SESSIONS, encodeFactoryCwd(cwd));
    const candidates = [...listJsonlFiles(scoped), ...listJsonlFiles(FACTORY_SESSIONS)]
      .filter((p) => {
        try {
          const st = statSync(p);
          const isNew = !before.has(p) || st.mtimeMs > (before.get(p) ?? 0) + 50;
          return isNew && st.mtimeMs >= sinceMs - 2000;
        } catch {
          return false;
        }
      })
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

    for (const p of candidates) {
      try {
        const first = readFileSync(p, 'utf8').split('\n')[0];
        if (!first) continue;
        const row = JSON.parse(first);
        if (row.type === 'session_start' && row.id) {
          return { session_id: row.id, jsonl_path: p, mirror_type: 'jsonl' };
        }
      } catch {
        continue;
      }
    }
    return null;
  },

  buildLaunchCommand(opts, bridge, launchMeta) {
    const args = ['--settings', launchMeta.settingsPath, '--cwd', opts.cwd];
    if (opts.resume && opts.resume !== 'last') args.push('-r', opts.resume);
    else if (opts.resume === 'last' || opts.resume === true) args.push('-r');
    if (opts.prompt) args.push(opts.prompt);
    return { bin: 'droid', args };
  },

  mapJsonlLine(line, bridgeId, bridge) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      return null;
    }
    const base = {
      ...eventBase(bridgeId, bridge, 'droid'),
      droid_model: bridge.droid_model,
    };

    if (row.type === 'session_start') {
      return { ...base, type: 'session_start', session_id: row.id, title: row.title };
    }

    if (row.type === 'message') {
      const role = row.message?.role;
      if (role === 'user') {
        const text = extractDroidText(row.message);
        if (!text) return null;
        return { ...base, type: 'user', text };
      }
      if (role === 'assistant') {
        const events = [];
        for (const block of row.message?.content ?? []) {
          if (block.type === 'text' && block.text?.trim()) {
            events.push({ ...base, type: 'assistant', text: block.text.trim() });
          }
          if (block.type === 'tool_use' && block.name) {
            events.push({ ...base, type: 'tool_use', name: block.name, input: block.input });
          }
        }
        return events.length ? events : null;
      }
    }

    if (row.type === 'todo_state') {
      return { ...base, type: 'todo_state', todos: row.todos ?? row.state ?? row };
    }

    return null;
  },
};

const ADAPTERS = {
  codex: codexAdapter,
  claude: claudeAdapter,
  grok: grokAdapter,
  amp: ampAdapter,
  agy: agyAdapter,
  ampcode: ampAdapter,
  droid: droidAdapter,
  factory: droidAdapter,
};

export function getAdapter(name) {
  const key = (name ?? '').toLowerCase().trim();
  return ADAPTERS[key] ?? null;
}

export function listHarnesses() {
  return ['codex', 'claude', 'grok', 'amp', 'agy', 'droid'];
}