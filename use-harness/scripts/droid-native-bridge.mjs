#!/usr/bin/env node
/**
 * Droid-native bridge — thin wrapper over harness-native-bridge (zen/go models).
 */

import { runBridgeCli } from './native-bridge-core.mjs';
import { droidAdapter } from './harness-adapters.mjs';

const usage = `droid-native-bridge (Factory Droid + ~/.factory zen/go custom models)

Usage:
  droid-native-bridge.mjs launch [--cwd PATH] [--model opencode-go/<id>|custom:OpenCode-*] [--prompt TEXT] [--resume SESSION_ID] [--id ID]
  droid-native-bridge.mjs models [--json]
  droid-native-bridge.mjs inject --id ID --prompt TEXT [--force]
  droid-native-bridge.mjs tail --id ID [--follow] [--mirror] [--json] [--idle-ms MS]
  droid-native-bridge.mjs status [--id ID]
  droid-native-bridge.mjs attach --id ID
  droid-native-bridge.mjs stop --id ID

Env:
  DROID_NATIVE_BRIDGE_ROOT    Override bridge root
  DROID_NATIVE_DEFAULT_MODEL  Default (default: opencode-go/kimi-k2.6)
`;

runBridgeCli(droidAdapter, process.argv, usage);