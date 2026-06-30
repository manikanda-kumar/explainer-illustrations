#!/usr/bin/env node
/**
 * Resolve opencode-go / bare model ids to Factory Droid custom:* model ids.
 * Allowlist: ~/.factory custom models with base URL opencode.ai/zen/go
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { defaultModel } from './harness-defaults.mjs';

const FACTORY_DIR = join(homedir(), '.factory');
const ZEN_GO = 'opencode.ai/zen/go';
const PREFIX = 'opencode-go/';
const DEFAULT = defaultModel('droid') || 'opencode-go/kimi-k2.6';

let droidIdCache = null;

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function isZenGoUrl(url = '') {
  return url.includes(ZEN_GO);
}

function loadZenGoCatalog() {
  const config = readJson(join(FACTORY_DIR, 'config.json'), { custom_models: [] });
  const settings = readJson(join(FACTORY_DIR, 'settings.json'), { customModels: [] });

  const byModel = new Map();

  for (const row of config.custom_models ?? []) {
    if (!isZenGoUrl(row.base_url)) continue;
    byModel.set(row.model, {
      modelId: row.model,
      opencodeGo: `${PREFIX}${row.model}`,
      displayName: row.model_display_name,
      droidId: null,
      source: 'config.json',
    });
  }

  for (const row of settings.customModels ?? []) {
    if (!isZenGoUrl(row.baseUrl)) continue;
    const existing = byModel.get(row.model) ?? {
      modelId: row.model,
      opencodeGo: `${PREFIX}${row.model}`,
      displayName: row.displayName,
      droidId: null,
      source: 'settings.json',
    };
    existing.droidId = row.id;
    existing.displayName = row.displayName ?? existing.displayName;
    existing.source = 'settings.json';
    byModel.set(row.model, existing);
  }

  return byModel;
}

function loadDroidCustomIdMap() {
  if (droidIdCache) return droidIdCache;
  const byId = new Map();
  const byLabel = new Map();
  const r = spawnSync('droid', ['exec', '-m', '__bridge_invalid_model__', '-o', 'text', 'probe'], {
    encoding: 'utf8',
  });
  const blob = `${r.stdout}\n${r.stderr}`;
  const re = /(custom:[^,\s]+)\s+\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(blob)) !== null) {
    const id = m[1];
    const label = m[2].trim();
    if (!id.includes('OpenCode-')) continue;
    byId.set(id, label);
    byLabel.set(label.toLowerCase(), id);
  }
  droidIdCache = { byId, byLabel };
  return droidIdCache;
}

function findDroidIdForEntry(entry) {
  if (entry.droidId) return entry.droidId;

  const { byId, byLabel } = loadDroidCustomIdMap();
  if (entry.displayName && byLabel.has(entry.displayName.toLowerCase())) {
    return byLabel.get(entry.displayName.toLowerCase());
  }

  const needle = entry.modelId.toLowerCase();
  for (const [id, label] of byId.entries()) {
    if (label.toLowerCase().includes(needle)) return id;
  }

  return null;
}

export function listZenGoModels() {
  const catalog = loadZenGoCatalog();
  return [...catalog.values()].map((e) => ({
    opencodeGo: e.opencodeGo,
    modelId: e.modelId,
    droidId: e.droidId ?? findDroidIdForEntry(e),
    displayName: e.displayName,
  }));
}

export function resolveZenGoModel(raw) {
  const input = raw || DEFAULT;
  const catalog = loadZenGoCatalog();

  if (catalog.size === 0) {
    throw new Error(
      'No opencode.ai/zen/go custom models in ~/.factory/config.json or ~/.factory/settings.json',
    );
  }

  if (input.startsWith('custom:')) {
    const { byId } = loadDroidCustomIdMap();
    if (!byId.has(input)) {
      throw new Error(`Unknown Droid custom model: ${input}`);
    }
    const label = byId.get(input);
    const entry = [...catalog.values()].find(
      (e) =>
        e.droidId === input ||
        e.displayName?.toLowerCase() === String(label).toLowerCase() ||
        label?.toLowerCase().includes(e.modelId.toLowerCase()),
    );
    if (!entry) {
      throw new Error(`Model ${input} is not an opencode.ai/zen/go custom model`);
    }
    return {
      droidModel: input,
      modelId: entry.modelId,
      opencodeGo: entry.opencodeGo,
      displayName: entry.displayName,
    };
  }

  let modelId = input;
  if (modelId.startsWith(PREFIX)) modelId = modelId.slice(PREFIX.length);

  const entry = catalog.get(modelId);
  if (!entry) {
    const allowed = [...catalog.values()].map((e) => e.opencodeGo).join(', ');
    throw new Error(`Model not in zen/go allowlist: ${input}. Allowed: ${allowed}`);
  }

  const droidModel = findDroidIdForEntry(entry);
  if (!droidModel) {
    throw new Error(
      `No Droid custom id for ${entry.opencodeGo}. Run \`droid exec\` and pick a custom:OpenCode-* model.`,
    );
  }

  return {
    droidModel,
    modelId: entry.modelId,
    opencodeGo: entry.opencodeGo,
    displayName: entry.displayName,
  };
}