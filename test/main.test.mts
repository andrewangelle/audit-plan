import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, it, mock } from 'node:test';
import {
  type MainArgs,
  main,
  type RunArgs,
  type RunResult,
} from '#src/main.mjs';

const root = mkdtempSync(join(tmpdir(), 'audit-plan-main-'));

const PASS: RunResult = {
  text: 'ok\nVERDICT: PASS',
  subtype: 'success',
  cost: 1,
};
const FAIL: RunResult = {
  text: 'bad\nVERDICT: FAIL',
  subtype: 'success',
  cost: 1,
};

type Step = RunResult | ((args: RunArgs) => RunResult);

/** A fake runner that replays `steps` in order and records every call. */
function fakeRunner(steps: Step[]) {
  const calls: RunArgs[] = [];
  const runAgent = async (args: RunArgs): Promise<RunResult> => {
    calls.push(args);
    const step = steps.shift();
    assert.ok(step, `unexpected extra call (#${calls.length})`);
    return typeof step === 'function' ? step(args) : step;
  };
  return { runAgent, calls };
}

/** A fix step that actually edits the plan, so its hash changes. */
const EDIT: Step = () => {
  appendFileSync(plan, '\nfixed');
  return { text: 'edited the plan', subtype: 'success', cost: 1 };
};

/** A fix step that leaves the plan untouched. */
const NO_EDIT: RunResult = {
  text: 'nothing to do',
  subtype: 'success',
  cost: 1,
};

let plan: string;
let n = 0;

function args(overrides: Partial<MainArgs> = {}): MainArgs {
  return {
    plan,
    scopePaths: [],
    testCmd: '',
    maxIters: 8,
    auditModel: 'audit-model',
    fixModel: 'fix-model',
    auditEffort: 'high',
    fixEffort: 'medium',
    requiredClean: 2,
    turnCap: 30,
    ...overrides,
  };
}

beforeEach(() => {
  // Keep the loop's progress logs out of the test output.
  mock.method(console, 'log', () => {});
  mock.method(console, 'error', () => {});
  plan = join(root, `plan-${n++}.md`);
  writeFileSync(plan, '# plan');
});

describe('main', () => {
  it('converges after requiredClean consecutive passes', async () => {
    const { runAgent, calls } = fakeRunner([PASS, PASS]);
    assert.equal(await main(args(), runAgent), 0);
    assert.equal(calls.length, 2);
  });

  it('respects a custom requiredClean', async () => {
    const { runAgent, calls } = fakeRunner([PASS, PASS, PASS]);
    assert.equal(await main(args({ requiredClean: 3 }), runAgent), 0);
    assert.equal(calls.length, 3);
  });

  it('runs a fix after a failed audit, then re-audits', async () => {
    const { runAgent, calls } = fakeRunner([FAIL, EDIT, PASS, PASS]);
    assert.equal(await main(args(), runAgent), 0);
    assert.deepEqual(
      calls.map((c) => c.model),
      ['audit-model', 'fix-model', 'audit-model', 'audit-model'],
    );
  });

  it('resets the clean count after a failure', async () => {
    // PASS, FAIL resets to 0, so it takes two more passes to converge.
    const { runAgent, calls } = fakeRunner([PASS, FAIL, EDIT, PASS, PASS]);
    assert.equal(await main(args(), runAgent), 0);
    assert.equal(calls.length, 5);
  });

  it('stops when a fix leaves the plan unchanged', async () => {
    const { runAgent, calls } = fakeRunner([FAIL, NO_EDIT]);
    assert.equal(await main(args(), runAgent), 1);
    assert.equal(calls.length, 2);
  });

  it('stops when the audit does not succeed', async () => {
    const { runAgent, calls } = fakeRunner([
      { text: '', subtype: 'error_max_turns', cost: 1 },
    ]);
    assert.equal(await main(args(), runAgent), 1);
    assert.equal(calls.length, 1);
  });

  it('treats an audit with no verdict as a failure', async () => {
    const { runAgent, calls } = fakeRunner([
      { text: 'no verdict here', subtype: 'success', cost: 1 },
      NO_EDIT,
    ]);
    assert.equal(await main(args(), runAgent), 1);
    assert.equal(calls[1].model, 'fix-model');
  });

  it('gives up after maxIters', async () => {
    const { runAgent, calls } = fakeRunner([FAIL, EDIT, FAIL, EDIT]);
    assert.equal(await main(args({ maxIters: 2 }), runAgent), 1);
    assert.equal(calls.length, 4);
  });

  it('counts a pass on the final iteration', async () => {
    const { runAgent } = fakeRunner([FAIL, EDIT, PASS]);
    assert.equal(
      await main(args({ maxIters: 2, requiredClean: 1 }), runAgent),
      0,
    );
  });

  it('passes the findings to the fix prompt', async () => {
    const { runAgent, calls } = fakeRunner([FAIL, NO_EDIT]);
    await main(args(), runAgent);
    assert.match(calls[1].prompt, /bad\nVERDICT: FAIL/);
    assert.ok(calls[1].prompt.includes(plan));
  });

  describe('audit call', () => {
    it('is read-only and scoped to the whole repo by default', async () => {
      const { runAgent, calls } = fakeRunner([PASS, PASS]);
      await main(args(), runAgent);
      const [audit] = calls;
      assert.deepEqual(audit.allowedTools, ['Read', 'Glob', 'Grep']);
      assert.equal(audit.permissionMode, 'plan');
      assert.equal(audit.effort, 'high');
      assert.equal(audit.turnCap, 30);
      assert.match(audit.prompt, / {2}- \(whole repo\)/);
      assert.doesNotMatch(audit.prompt, /Bash/);
    });

    it('lists the scoped paths', async () => {
      const { runAgent, calls } = fakeRunner([PASS, PASS]);
      await main(args({ scopePaths: ['src', 'lib'] }), runAgent);
      assert.match(calls[0].prompt, / {2}- src\n {2}- lib/);
      assert.doesNotMatch(calls[0].prompt, /whole repo/);
    });

    it('allows only the test command via Bash when --run-tests is set', async () => {
      const { runAgent, calls } = fakeRunner([PASS, PASS]);
      await main(args({ testCmd: 'pnpm test' }), runAgent);
      assert.deepEqual(calls[0].allowedTools, [
        'Read',
        'Glob',
        'Grep',
        'Bash(pnpm test)',
      ]);
      assert.match(calls[0].prompt, /you MAY run `pnpm test` via Bash/);
    });
  });

  describe('fix call', () => {
    it('can edit but not run Bash', async () => {
      const { runAgent, calls } = fakeRunner([FAIL, NO_EDIT]);
      await main(args({ fixEffort: 'low', turnCap: 5 }), runAgent);
      const fix = calls[1];
      assert.deepEqual(fix.allowedTools, ['Read', 'Edit', 'Glob', 'Grep']);
      assert.deepEqual(fix.disallowedTools, ['Bash']);
      assert.equal(fix.permissionMode, 'bypassPermissions');
      assert.equal(fix.effort, 'low');
      assert.equal(fix.turnCap, 5);
    });
  });
});
