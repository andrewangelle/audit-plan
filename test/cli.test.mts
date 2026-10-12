import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

const CLI = resolve(import.meta.dirname, '../src/cli.mts');

/** Runs the CLI from `cwd`, a scratch dir outside any git repo by default. */
function cli(
  args: string[],
  cwd = mkdtempSync(join(tmpdir(), 'audit-plan-cli-')),
) {
  const { INIT_CWD: _, FORCE_COLOR: __, ...env } = process.env;
  const res = spawnSync(
    process.execPath,
    ['--conditions=source', CLI, ...args],
    { cwd, env: { ...env, NO_COLOR: '1' }, encoding: 'utf8' },
  );
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

/** A scratch dir with `.claude/plans/<names>` already in place. */
function withPlans(...names: string[]) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'audit-plan-cli-')));
  const plansDir = join(dir, '.claude/plans');
  mkdirSync(plansDir, { recursive: true });
  for (const name of names) writeFileSync(join(plansDir, name), '# plan');
  return dir;
}

describe('cli', () => {
  it('prints usage and exits 0 with --help', () => {
    for (const flag of ['--help', '-h']) {
      const { code, stdout } = cli([flag]);
      assert.equal(code, 0);
      assert.match(stdout, /Usage:/);
      assert.match(stdout, /--max-iters/);
    }
  });

  it('exits 2 without a plan', () => {
    const { code, stderr } = cli([]);
    assert.equal(code, 2);
    assert.match(stderr, /expected exactly one plan/);
  });

  it('exits 2 with more than one plan', () => {
    const { code, stderr } = cli(['a.md', 'b.md']);
    assert.equal(code, 2);
    assert.match(stderr, /expected exactly one plan/);
  });

  it('exits 2 on an unknown option', () => {
    const { code, stderr } = cli(['plan.md', '--bogus']);
    assert.equal(code, 2);
    assert.match(stderr, /error: .*--bogus/);
    assert.match(stderr, /Usage:/);
  });

  describe('plan not found', () => {
    it('exits 1 and lists the available plans', () => {
      const cwd = withPlans('first.md', 'second.md');
      const { code, stderr } = cli(['missing'], cwd);
      assert.equal(code, 1);
      assert.match(stderr, /Plan not found: missing/);
      assert.match(stderr, /Available plans:\n {2}first\.md\n {2}second\.md/);
    });

    it('exits 1 and says so when there is no plans dir', () => {
      const { code, stderr } = cli(['missing']);
      assert.equal(code, 1);
      assert.match(stderr, /No plans found in .*\.claude\/plans/);
    });
  });

  describe('option validation', () => {
    const cases: [string, string, RegExp][] = [
      ['--max-iters', '0', /--max-iters must be a positive integer/],
      ['--max-iters', '1.5', /--max-iters must be a positive integer/],
      ['--max-iters', 'abc', /--max-iters must be a positive integer/],
      ['--required-clean', '-1', /--required-clean must be a positive integer/],
      ['--turn-cap', '0', /--turn-cap must be a positive integer/],
      [
        '--audit-effort',
        'extreme',
        /--audit-effort must be one of low, medium, high, xhigh, max/,
      ],
      ['--fix-effort', 'none', /--fix-effort must be one of/],
    ];

    for (const [flag, value, message] of cases) {
      it(`exits 2 for ${flag}=${value}`, () => {
        const cwd = withPlans('plan.md');
        const { code, stderr } = cli(['plan', `${flag}=${value}`], cwd);
        assert.equal(code, 2);
        assert.match(stderr, message);
      });
    }
  });
});
