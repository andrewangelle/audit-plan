import {
  type EffortLevel,
  type Options,
  type PermissionMode,
  query,
} from '@anthropic-ai/claude-agent-sdk';
import { LOAD_PROJECT_CONTEXT, REPO_ROOT } from '#src/constants.mjs';
import {
  logAuditEnd,
  logAuditFail,
  logAuditPass,
  logAuditStart,
  logFixEnd,
  logFixNoChange,
  logFixStart,
  logMaxIters,
  logPlanUpdated,
  logToolUse,
} from '#src/logging.mjs';
import { AUDIT_PROMPT, FIX_PROMPT } from '#src/prompt.mjs';
import { sha, verdictIsPass } from '#src/utils.mjs';

export type MainArgs = {
  plan: string;
  scopePaths: string[];
  testCmd: string;
  maxIters: number;
  auditModel: string;
  fixModel: string;
  auditEffort: EffortLevel;
  fixEffort: EffortLevel;
  requiredClean: number;
  turnCap: number;
};

export async function main(
  {
    plan,
    scopePaths,
    testCmd,
    maxIters,
    auditModel,
    fixModel,
    auditEffort,
    fixEffort,
    requiredClean,
    turnCap,
  }: MainArgs,
  runAgent: RunFn = run,
): Promise<number> {
  const scope =
    scopePaths.map((p) => `  - ${p}`).join('\n') || '  - (whole repo)';
  let testsClause = '';
  let auditTools = ['Read', 'Glob', 'Grep'];
  if (testCmd) {
    testsClause =
      `, and runtime behavior (you MAY run \`${testCmd}\` via Bash to confirm ` +
      'a claim, but only when a structural check cannot settle it)';
    auditTools = [...auditTools, `Bash(${testCmd})`];
  }

  let clean = 0;
  let totalCost = 0;

  for (let i = 1; i <= maxIters; i++) {
    logAuditStart(auditModel, auditEffort, i);

    const audit = await runAgent({
      prompt: AUDIT_PROMPT({ plan, scope, testsClause }),
      model: auditModel,
      effort: auditEffort,
      allowedTools: auditTools,
      permissionMode: 'plan',
      turnCap,
    });

    totalCost += audit.cost;

    logAuditEnd(audit, totalCost);

    if (audit.subtype !== 'success') {
      logAuditFail(audit.subtype);
      return 1;
    }

    if (verdictIsPass(audit.text)) {
      clean++;

      logAuditPass({
        cleanPasses: clean,
        minimumCleanPasses: requiredClean,
        totalRuns: i,
        totalCost,
      });

      if (clean >= requiredClean) {
        return 0;
      }
      continue;
    }

    // FAIL -> fix, then loop back to re-audit
    clean = 0;
    const before = sha(plan);

    logFixStart(fixModel, fixEffort, i);

    const fix = await runAgent({
      prompt: FIX_PROMPT({ plan, findings: audit.text }),
      model: fixModel,
      effort: fixEffort,
      allowedTools: ['Read', 'Edit', 'Glob', 'Grep'],
      // bypassPermissions: acceptEdits won't auto-approve edits under .claude/,
      // and headless has no one to answer a prompt. Deny Bash to stay bounded.
      permissionMode: 'bypassPermissions',
      disallowedTools: ['Bash'],
      turnCap,
    });

    totalCost += fix.cost;

    logFixEnd(fix, totalCost);

    if (sha(plan) === before) {
      logFixNoChange();
      return 1;
    }
    logPlanUpdated();
  }

  logMaxIters(maxIters, totalCost);
  return 1;
}

/** One headless call. */
export type RunResult = {
  text: string;
  subtype: string;
  cost: number;
};

export type RunArgs = {
  prompt: string;
  model: string;
  effort: EffortLevel;
  allowedTools: string[];
  permissionMode: PermissionMode;
  disallowedTools?: string[];
  turnCap: number;
};

export type RunFn = (args: RunArgs) => Promise<RunResult>;

async function run({
  prompt,
  model,
  effort,
  allowedTools,
  permissionMode,
  disallowedTools = [],
  turnCap,
}: RunArgs): Promise<RunResult> {
  let text = '';
  let subtype = 'unknown';
  let cost = 0;

  const options: Options = {
    cwd: REPO_ROOT,
    model,
    effort,
    allowedTools,
    disallowedTools,
    permissionMode,
    maxTurns: turnCap,
    settingSources: LOAD_PROJECT_CONTEXT ? ['project'] : [],
    ...(permissionMode === 'bypassPermissions'
      ? { allowDangerouslySkipPermissions: true }
      : {}),
  };

  let turn = 0;

  for await (const msg of query({ prompt, options })) {
    if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'tool_use') {
          turn++;
          const inp = (block.input ?? {}) as Record<string, unknown>;
          const detail = inp.file_path ?? inp.pattern ?? inp.command ?? '';
          logToolUse({
            turn,
            turnCap,
            toolName: block.name,
            detail: String(detail),
          });
        }
      }
    } else if (msg.type === 'result') {
      subtype = msg.subtype;
      if (typeof msg.total_cost_usd === 'number') {
        cost = msg.total_cost_usd;
      }
      if (msg.subtype === 'success' && msg.result) {
        text = msg.result;
      }
    }
  }
  return { text, subtype, cost };
}
