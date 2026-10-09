import {
  type EffortLevel,
  type Options,
  type PermissionMode,
  query,
} from '@anthropic-ai/claude-agent-sdk';
import { LOAD_PROJECT_CONTEXT, REPO_ROOT } from '#src/constants.mjs';
import { AUDIT_PROMPT, FIX_PROMPT } from '#src/prompt.mjs';
import {
  colors,
  colorVerdicts,
  errorColors,
  sha,
  verdictIsPass,
} from '#src/utils.mjs';

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

export async function main({
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
}: MainArgs): Promise<number> {
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
  const bar = (ch: string) => ch.repeat(60);

  for (let i = 1; i <= maxIters; i++) {
    console.log(
      colors.audit(
        `\n${bar('=')}\n=== Iteration ${i}: AUDIT (${auditModel}/${auditEffort})\n${bar('=')}`,
      ),
    );

    const audit = await run({
      prompt: AUDIT_PROMPT({ plan, scope, testsClause }),
      model: auditModel,
      effort: auditEffort,
      allowedTools: auditTools,
      permissionMode: 'plan',
      turnCap,
    });

    totalCost += audit.cost;

    console.log(
      colorVerdicts(audit.text.trim()) || colors.dim('(no audit output)\n'),
    );
    console.log(
      colors.dim(
        `[audit ${audit.subtype}]  step $${audit.cost.toFixed(4)}  running $${totalCost.toFixed(4)}`,
      ),
    );

    if (audit.subtype !== 'success') {
      console.error(
        errorColors.error(
          `Audit did not complete cleanly (${audit.subtype}); stopping.`,
        ),
      );
      return 1;
    }

    if (verdictIsPass(audit.text)) {
      clean++;

      console.log(colors.ok(`Clean audit (${clean}/${requiredClean})`));

      if (clean >= requiredClean) {
        console.log(
          colors.success(
            `\n[+] Converged after ${i} iterations. Total $${totalCost.toFixed(4)}`,
          ),
        );
        return 0;
      }
      continue;
    }

    // FAIL -> fix, then loop back to re-audit
    clean = 0;
    const before = sha(plan);

    console.log(
      colors.fix(
        `\n${bar('-')}\n--- Iteration ${i}: FIX (${fixModel}/${fixEffort})\n${bar('-')}`,
      ),
    );

    const fix = await run({
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

    console.log(fix.text.trim() || colors.dim('(no fix summary)'));
    console.log(
      colors.dim(
        `\n[fix ${fix.subtype}]  step $${fix.cost.toFixed(4)}  running $${totalCost.toFixed(4)}`,
      ),
    );

    if (sha(plan) === before) {
      console.error(
        errorColors.warn('\n[!] The fix step made NO change to the plan file.'),
      );
      console.error(
        errorColors.warn(
          '    Either there was nothing concrete to change, or the fixer',
        ),
      );
      console.error(
        errorColors.warn(
          "    could not apply edits. Stopping so it doesn't spin.",
        ),
      );
      return 1;
    }
    console.log(colors.dim('\n    plan updated -> re-auditing...'));
  }

  console.error(
    errorColors.warn(
      `\n[!] Hit max-iters (${maxIters}) without converging. Total $${totalCost.toFixed(4)}`,
    ),
  );
  return 1;
}

/** One headless call. */
type RunResult = {
  text: string;
  subtype: string;
  cost: number;
};

type RunArgs = {
  prompt: string;
  model: string;
  effort: EffortLevel;
  allowedTools: string[];
  permissionMode: PermissionMode;
  disallowedTools?: string[];
  turnCap: number;
};

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
          console.log(
            `  ${colors.dim(`[${turn}/${turnCap}]`)} ${colors.tool(block.name)} ${colors.dim(String(detail))}`,
          );
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
