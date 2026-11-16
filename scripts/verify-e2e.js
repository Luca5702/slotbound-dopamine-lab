#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

export const TIER_MANIFEST = Object.freeze({
  1: {
    tier: 1,
    id: 'tier1',
    name: 'Tier 1: Feature Coverage (Happy Path — 19 Features × 5 Cases)',
    file: 'tests/e2e/tier1-feature-coverage.test.js',
    expectedMinTests: 95,
    expectedCases: 95,
  },
  2: {
    tier: 2,
    id: 'tier2',
    name: 'Tier 2: Boundary & Corner Cases (Edge/Invalid — 19 Features × 5 Cases)',
    file: 'tests/e2e/tier2-boundary-corner.test.js',
    expectedMinTests: 95,
    expectedCases: 95,
  },
  3: {
    tier: 3,
    id: 'tier3',
    name: 'Tier 3: Cross-Feature Pairwise Combinations (20 Cases)',
    file: 'tests/e2e/tier3-cross-feature.test.js',
    expectedMinTests: 20,
    expectedCases: 20,
  },
  4: {
    tier: 4,
    id: 'tier4',
    name: 'Tier 4: Real-World End-User & Headless Chromium Scenarios (10 Scenarios)',
    file: 'tests/e2e/tier4-real-world-scenarios.test.js',
    expectedMinTests: 10,
    expectedCases: 10,
  },
  5: {
    tier: 5,
    id: 'tier5',
    name: 'Tier 5: White-Box Adversarial Hardening (30 Cases)',
    file: 'tests/e2e/tier5-adversarial-hardening.test.js',
    expectedMinTests: 30,
    expectedCases: 30,
  },
});

function parseRequestedTiers(argv) {
  const selected = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i]);
    if (arg.startsWith('--tier=')) {
      const raw = arg.slice('--tier='.length);
      for (const token of raw.split(',')) {
        const n = Number(token.trim());
        if (TIER_MANIFEST[n] && !selected.includes(n)) selected.push(n);
      }
    } else if (arg === '--tier' && argv[i + 1]) {
      const raw = String(argv[i + 1]);
      i++;
      for (const token of raw.split(',')) {
        const n = Number(token.trim());
        if (TIER_MANIFEST[n] && !selected.includes(n)) selected.push(n);
      }
    }
  }
  return selected.length > 0 ? selected : [1, 2, 3, 4, 5];
}

function parseNodeTestSummary(output) {
  const clean = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  const testsMatch = clean.match(/ℹ\s+tests\s+(\d+)/);
  const passMatch = clean.match(/ℹ\s+pass\s+(\d+)/);
  const failMatch = clean.match(/ℹ\s+fail\s+(\d+)/);

  const tests = testsMatch ? Number(testsMatch[1]) : 0;
  const pass = passMatch ? Number(passMatch[1]) : 0;
  const fail = failMatch ? Number(failMatch[1]) : 0;
  return { tests, pass, fail };
}

function runSingleTier(tierConfig) {
  const fullPath = path.resolve(PROJECT_ROOT, tierConfig.file);
  if (!fs.existsSync(fullPath)) {
    return Promise.resolve({
      tier: tierConfig.tier,
      name: tierConfig.name,
      file: tierConfig.file,
      exitCode: 1,
      tests: 0,
      pass: 0,
      fail: 1,
      durationMs: 0,
      ok: false,
    });
  }

  console.log(`\n================================================================================`);
  console.log(`▶ Running ${tierConfig.name}`);
  console.log(`  File: ${tierConfig.file}`);
  console.log(`================================================================================`);

  const startMs = Date.now();
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['--test', '--test-reporter=spec', fullPath],
      {
        cwd: PROJECT_ROOT,
        env: { ...process.env, FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    let combined = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      combined += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      combined += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - startMs;
      const { tests, pass, fail } = parseNodeTestSummary(combined);
      const ok = code === 0 && pass > 0 && fail === 0;
      resolve({
        tier: tierConfig.tier,
        name: tierConfig.name,
        file: tierConfig.file,
        exitCode: code ?? 1,
        tests,
        pass,
        fail,
        durationMs,
        ok,
      });
    });
  });
}

async function main() {
  const tiersToRun = parseRequestedTiers(process.argv.slice(2));
  const results = [];

  for (const tierNum of tiersToRun) {
    const cfg = TIER_MANIFEST[tierNum];
    const res = await runSingleTier(cfg);
    results.push(res);
  }

  let totalTests = 0;
  let totalPass = 0;
  let totalFail = 0;
  let allOk = true;

  console.log(`\n================================================================================`);
  console.log(`E2E Verification Summary (Slotbound Minimalist Dopamine Lab)`);
  console.log(`================================================================================`);
  for (const r of results) {
    totalTests += r.tests;
    totalPass += r.pass;
    totalFail += r.fail;
    if (!r.ok) allOk = false;
    const statusLabel = r.ok ? 'PASS' : 'FAIL';
    console.log(
      `[Tier ${r.tier}] ${statusLabel} | tests: ${r.tests} | pass: ${r.pass} | fail: ${r.fail} | ${(r.durationMs / 1000).toFixed(2)}s | ${r.file}`
    );
  }
  console.log(`--------------------------------------------------------------------------------`);
  console.log(
    `TOTAL   | ${allOk && totalPass > 0 ? 'PASS' : 'FAIL'} | tests: ${totalTests} | pass: ${totalPass} | fail: ${totalFail}`
  );
  console.log(`================================================================================\n`);

  if (!allOk || totalPass === 0 || totalFail > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('[verify-e2e] Fatal error:', err);
  process.exit(1);
});
