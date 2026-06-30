#!/usr/bin/env node
/**
 * Unified harness-native bridge CLI (tmux + inject + session mirror).
 *
 * Usage:
 *   harness-native-bridge.mjs <harness> launch|inject|tail|status|attach|stop|models [options]
 */

import { runBridgeCli } from './native-bridge-core.mjs';
import { getAdapter, listHarnesses } from './harness-adapters.mjs';

function usage() {
  return `harness-native-bridge (tmux-hosted harness TUI + transcript mirror)

Harnesses: ${listHarnesses().join(', ')} (aliases: ampcode → amp, factory → droid)

Usage:
  harness-native-bridge.mjs <harness> launch [--cwd PATH] [--model ID] [--mode MODE] [--prompt TEXT] [--resume last|ID] [--write] [--id ID]
  harness-native-bridge.mjs <harness> inject --id ID --prompt TEXT [--force]
  harness-native-bridge.mjs <harness> tail --id ID [--follow] [--mirror] [--json] [--idle-ms MS]
  harness-native-bridge.mjs <harness> status [--id ID]
  harness-native-bridge.mjs <harness> attach --id ID
  harness-native-bridge.mjs <harness> stop --id ID
  harness-native-bridge.mjs droid models [--json]

Env (per harness):
  CODEX_NATIVE_BRIDGE_ROOT, CLAUDE_NATIVE_BRIDGE_ROOT, GROK_NATIVE_BRIDGE_ROOT,
  AMP_NATIVE_BRIDGE_ROOT, AGY_NATIVE_BRIDGE_ROOT, DROID_NATIVE_BRIDGE_ROOT
  DROID_NATIVE_DEFAULT_MODEL  Default zen/go model for droid
  CLAUDE_NATIVE_DEFAULT_MODEL / CODEX_NATIVE_DEFAULT_MODEL / GROK_NATIVE_DEFAULT_MODEL
  AMP_NATIVE_DEFAULT_MODE / AGY_NATIVE_DEFAULT_MODE
  (see harness-defaults.mjs — applied on launch when --model/--mode omitted)
`;
}

const argv = process.argv.slice(2);
const harnessArg = argv[0];
const knownCommands = new Set(['launch', 'inject', 'tail', 'status', 'attach', 'stop', 'models', '--help', '-h']);

let harnessName = harnessArg;
let restArgv = process.argv;

if (!harnessName || knownCommands.has(harnessName) || harnessName.startsWith('-')) {
  console.log(usage());
  process.exit(harnessName ? 0 : 2);
}

const adapter = getAdapter(harnessName);
if (!adapter) {
  console.error(`Unknown harness: ${harnessName}`);
  console.log(usage());
  process.exit(2);
}

restArgv = ['node', 'harness-native-bridge.mjs', ...argv.slice(1)];
runBridgeCli(adapter, restArgv, usage());