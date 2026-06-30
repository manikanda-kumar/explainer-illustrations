import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function timestampSlug() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

export function writeText(path, text) {
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`);
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function createRun({ root = '.harness/runs', backend, task }) {
  const run_id = `${backend}-${timestampSlug()}-${randomSuffix()}`;
  const runDir = join(root, run_id);
  mkdirSync(runDir, { recursive: true });

  const receipt = {
    ok: true,
    run_id,
    backend,
    task,
    status: 'created',
    paths: {
      run_dir: runDir,
      receipt: join(runDir, 'receipt.json'),
      input: join(runDir, 'input.md'),
      prompt: join(runDir, 'prompt.md'),
      route: join(runDir, 'route.json'),
      command: join(runDir, 'command.json'),
      events: join(runDir, 'events.jsonl'),
      transcript: join(runDir, 'transcript.md'),
      stdout: join(runDir, 'stdout.log'),
      stderr: join(runDir, 'stderr.log'),
      bridge: join(runDir, 'bridge.json'),
      result: join(runDir, 'result.json'),
      summary: join(runDir, 'summary.md'),
      aggregate: join(runDir, 'aggregate.json'),
    },
  };

  writeJson(receipt.paths.receipt, receipt);
  writeFileSync(receipt.paths.events, '');
  return receipt;
}

export function appendEvent(eventsPath, event) {
  const enriched = {
    ts: new Date().toISOString(),
    ...event,
  };
  appendFileSync(eventsPath, `${JSON.stringify(enriched)}\n`);
}

export function writeResult(resultPath, result) {
  writeJson(resultPath, result);
}