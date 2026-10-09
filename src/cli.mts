#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { EffortLevel } from '@anthropic-ai/claude-agent-sdk';
import {
  AUDIT_EFFORT,
  AUDIT_MODEL,
  EFFORT_LEVELS,
  FIX_EFFORT,
  FIX_MODEL,
  MAX_ITERS,
  PLANS_DIR,
  REQUIRED_CLEAN,
  TURN_CAP,
} from '#src/constants.mjs';
import { main } from '#src/main.mjs';
import { colors, errorColors, isFile, resolvePlan } from '#src/utils.mjs';

const USAGE = `
Usage: 
  audit-plan ${colors.pass('<plan>')} [options]

Plan:
  an implementation plan file, written by another agent, to audit

Options:
  --paths           repo paths the audit may read: "a b", a,b, or repeat the flag
  --run-tests       a test command (CMD) the audit may run via Bash to confirm runtime claims
  --max-iters       the maximum number of turns of iterating through audit and fixes (default: ${MAX_ITERS})
  --audit-model     the claude model to use during the audit phase (default: ${AUDIT_MODEL})
  --fix-model       the claude model to use during the fix phase (default: ${FIX_MODEL})
  --audit-effort    the effort level for the audit phase: ${EFFORT_LEVELS.join(' | ')} (default: ${AUDIT_EFFORT})
  --fix-effort      the effort level for the fix phase: ${EFFORT_LEVELS.join(' | ')} (default: ${FIX_EFFORT})
  --required-clean  consecutive clean audits required before declaring convergence (default: ${REQUIRED_CLEAN})
  --turn-cap        the maximum tool-use round trips per audit or fix call (default: ${TURN_CAP})
  -h, --help        show this help message

  Only ${colors.pass('<plan>')} is required 
    - It can be a path to the file
    - It can also be the filename if located in .claude/plans/
`;

let parsed: {
  values: {
    paths: string[];
    'run-tests': string;
    'max-iters': string;
    'audit-model': string;
    'fix-model': string;
    'audit-effort': string;
    'fix-effort': string;
    'required-clean': string;
    'turn-cap': string;
    help: boolean;
  };
  positionals: string[];
};

try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      paths: { type: 'string', multiple: true, default: [] },
      'run-tests': { type: 'string', default: '' },
      'max-iters': { type: 'string', default: String(MAX_ITERS) },
      'audit-model': { type: 'string', default: AUDIT_MODEL },
      'fix-model': { type: 'string', default: FIX_MODEL },
      'audit-effort': { type: 'string', default: AUDIT_EFFORT },
      'fix-effort': { type: 'string', default: FIX_EFFORT },
      'required-clean': { type: 'string', default: String(REQUIRED_CLEAN) },
      'turn-cap': { type: 'string', default: String(TURN_CAP) },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
} catch (err) {
  console.error(
    `${errorColors.error(`error: ${(err as Error).message}`)}\n${USAGE}`,
  );
  process.exit(2);
}

const { values, positionals } = parsed;

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

if (positionals.length !== 1) {
  console.error(
    `${errorColors.error('error: expected exactly one plan')}\n${USAGE}`,
  );
  process.exit(2);
}

const plan = resolvePlan(positionals[0]);

if (!plan) {
  console.error(errorColors.error(`Plan not found: ${positionals[0]}`));

  let available: string[] = [];

  try {
    available = readdirSync(PLANS_DIR).filter((f) =>
      isFile(resolve(PLANS_DIR, f)),
    );
  } catch {
    // no plans directory
  }

  console.error(
    available.length
      ? `${errorColors.bold('Available plans:')}\n${available.map((f) => `  ${f}`).join('\n')}`
      : `No plans found in ${PLANS_DIR}`,
  );

  process.exit(1);
}

function positiveInt(flag: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    console.error(
      errorColors.error(`error: ${flag} must be a positive integer`),
    );
    process.exit(2);
  }
  return n;
}

function effort(flag: string, raw: string): EffortLevel {
  if (!EFFORT_LEVELS.includes(raw as EffortLevel)) {
    console.error(
      errorColors.error(
        `error: ${flag} must be one of ${EFFORT_LEVELS.join(', ')}`,
      ),
    );
    process.exit(2);
  }
  return raw as EffortLevel;
}

const maxIters = positiveInt('--max-iters', values['max-iters']);
const requiredClean = positiveInt('--required-clean', values['required-clean']);
const turnCap = positiveInt('--turn-cap', values['turn-cap']);
const auditEffort = effort('--audit-effort', values['audit-effort']);
const fixEffort = effort('--fix-effort', values['fix-effort']);

// Accept `--paths "a b"`, `--paths a,b`, and repeated `--paths a --paths b`.
const scopePaths = values.paths
  .flatMap((p) => p.split(/[\s,]+/))
  .filter(Boolean);

const result = await main({
  plan,
  scopePaths,
  testCmd: values['run-tests'],
  maxIters,
  auditModel: values['audit-model'],
  fixModel: values['fix-model'],
  auditEffort,
  fixEffort,
  requiredClean,
  turnCap,
});

process.exit(result);
