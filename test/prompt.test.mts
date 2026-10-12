import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AUDIT_PROMPT, FIX_PROMPT } from '#src/prompt.mjs';
import { verdictIsPass } from '#src/utils.mjs';

const auditPrompt = AUDIT_PROMPT({
  plan: '/repo/.claude/plans/example.md',
  scope: '  - src\n  - lib',
  testsClause: ', and runtime behavior',
});

const fixPrompt = FIX_PROMPT({
  plan: '/repo/.claude/plans/example.md',
  findings: 'claim: foo() exists\nevidence: src/a.ts:1\nVERDICT: FAIL',
});

describe('AUDIT_PROMPT', () => {
  it('matches the snapshot', (t) => {
    t.assert.snapshot(auditPrompt);
  });

  it('ends with verdict lines that verdictIsPass understands', () => {
    const verdictLines = auditPrompt.trimEnd().split('\n').slice(-2);
    assert.deepEqual(verdictLines, ['VERDICT: PASS', 'VERDICT: FAIL']);
    assert.equal(verdictIsPass(verdictLines[0]), true);
    assert.equal(verdictIsPass(verdictLines[1]), false);
  });

  it('interpolates the plan, scope, and tests clause', () => {
    assert.ok(
      auditPrompt.includes('The plan is at: /repo/.claude/plans/example.md'),
    );
    assert.ok(auditPrompt.includes('  - src\n  - lib'));
    assert.ok(
      auditPrompt.includes('data shapes, and runtime behavior -- VERIFY'),
    );
  });
});

describe('FIX_PROMPT', () => {
  it('matches the snapshot', (t) => {
    t.assert.snapshot(fixPrompt);
  });

  it('includes the plan path and the findings', () => {
    assert.ok(fixPrompt.includes('/repo/.claude/plans/example.md'));
    assert.ok(fixPrompt.endsWith('evidence: src/a.ts:1\nVERDICT: FAIL\n'));
  });
});
