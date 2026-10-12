import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

// PLANS_DIR is resolved from INIT_CWD at import time, so point it at a scratch
// dir (outside any git repo) before loading the module.
const root = realpathSync(mkdtempSync(join(tmpdir(), 'audit-plan-utils-')));
const plansDir = join(root, '.claude/plans');
mkdirSync(plansDir, { recursive: true });
process.env.INIT_CWD = root;

const { sha, splitPaths, verdictIsPass, resolvePlan, isFile } = await import(
  '#src/utils.mjs'
);

describe('verdictIsPass', () => {
  it('passes on a final PASS line', () => {
    assert.equal(verdictIsPass('looks good\nVERDICT: PASS'), true);
  });

  it('fails on a final FAIL line', () => {
    assert.equal(verdictIsPass('broken\nVERDICT: FAIL'), false);
  });

  it('uses the last verdict when there are several', () => {
    assert.equal(verdictIsPass('VERDICT: FAIL\nfixed it\nVERDICT: PASS'), true);
    assert.equal(
      verdictIsPass('VERDICT: PASS\nwait, no\nVERDICT: FAIL'),
      false,
    );
  });

  it('is case-insensitive', () => {
    assert.equal(verdictIsPass('verdict: pass'), true);
  });

  it('tolerates trailing text on the verdict line', () => {
    assert.equal(verdictIsPass('VERDICT: PASS.'), true);
    assert.equal(verdictIsPass('VERDICT: PASS (all claims verified)'), true);
  });

  it('tolerates text after the verdict line', () => {
    assert.equal(verdictIsPass('VERDICT: PASS\n\nThanks!'), true);
  });

  it('fails when there is no verdict', () => {
    assert.equal(verdictIsPass(''), false);
    assert.equal(verdictIsPass('everything looks fine'), false);
  });

  it('ignores verdicts that do not start a line', () => {
    assert.equal(verdictIsPass('I would say VERDICT: PASS'), false);
  });

  it('rejects words that merely start with PASS/FAIL', () => {
    assert.equal(verdictIsPass('VERDICT: PASSED'), false);
    assert.equal(verdictIsPass('VERDICT: PASS\nVERDICT: FAILED'), true);
  });
});

describe('splitPaths', () => {
  it('splits on spaces', () => {
    assert.deepEqual(splitPaths(['src lib']), ['src', 'lib']);
  });

  it('splits on commas', () => {
    assert.deepEqual(splitPaths(['src,lib']), ['src', 'lib']);
  });

  it('flattens repeated flags', () => {
    assert.deepEqual(splitPaths(['src', 'lib, test']), ['src', 'lib', 'test']);
  });

  it('drops empty entries', () => {
    assert.deepEqual(splitPaths([]), []);
    assert.deepEqual(splitPaths([' , ', '']), []);
    assert.deepEqual(splitPaths([',src,,lib,']), ['src', 'lib']);
  });
});

describe('sha', () => {
  it('hashes file contents', () => {
    const file = join(root, 'sha.txt');
    writeFileSync(file, 'hello');
    assert.equal(
      sha(file),
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('changes when contents change', () => {
    const file = join(root, 'sha-change.txt');
    writeFileSync(file, 'a');
    const before = sha(file);
    writeFileSync(file, 'b');
    assert.notEqual(sha(file), before);
  });

  it('returns an empty string for a missing file', () => {
    assert.equal(sha(join(root, 'nope.txt')), '');
  });
});

describe('isFile', () => {
  it('is true for files only', () => {
    const file = join(root, 'is-file.txt');
    writeFileSync(file, '');
    assert.equal(isFile(file), true);
    assert.equal(isFile(root), false);
    assert.equal(isFile(join(root, 'missing')), false);
  });
});

describe('resolvePlan', () => {
  const callerDir = join(root, 'caller');
  mkdirSync(callerDir, { recursive: true });

  afterEach(() => {
    process.env.INIT_CWD = root;
  });

  it('resolves a path relative to INIT_CWD', () => {
    process.env.INIT_CWD = callerDir;
    const plan = join(callerDir, 'local-plan.md');
    writeFileSync(plan, '# plan');
    assert.equal(resolvePlan('local-plan.md'), plan);
  });

  it('accepts an absolute path', () => {
    const plan = join(callerDir, 'abs-plan.md');
    writeFileSync(plan, '# plan');
    assert.equal(resolvePlan(plan), plan);
  });

  it('falls back to a file name in .claude/plans', () => {
    const plan = join(plansDir, 'named.md');
    writeFileSync(plan, '# plan');
    assert.equal(resolvePlan('named.md'), plan);
  });

  it('appends .md for a bare name in .claude/plans', () => {
    const plan = join(plansDir, 'bare.md');
    writeFileSync(plan, '# plan');
    assert.equal(resolvePlan('bare'), plan);
  });

  it('prefers the caller path over .claude/plans', () => {
    process.env.INIT_CWD = callerDir;
    const local = join(callerDir, 'both.md');
    writeFileSync(local, '# local');
    writeFileSync(join(plansDir, 'both.md'), '# plans');
    assert.equal(resolvePlan('both.md'), local);
  });

  it('ignores directories', () => {
    mkdirSync(join(plansDir, 'a-dir'), { recursive: true });
    assert.equal(resolvePlan('a-dir'), undefined);
  });

  it('returns undefined when nothing matches', () => {
    assert.equal(resolvePlan('does-not-exist'), undefined);
  });
});
