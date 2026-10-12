import { styleText } from 'node:util';

// ---- Colors ------------------------------------------------------------------
export type Style = Parameters<typeof styleText>[0];

export const toStdout = (format: Style) => (text: string) =>
  styleText(format, text, { stream: process.stdout });

export const toStderr = (format: Style) => (text: string) =>
  styleText(format, text, { stream: process.stderr });

export const colors = {
  audit: toStdout(['bold', 'cyan']),
  fix: toStdout(['bold', 'magenta']),
  tool: toStdout('blue'),
  dim: toStdout('dim'),
  pass: toStdout(['bold', 'green']),
  fail: toStdout(['bold', 'red']),
  ok: toStdout('green'),
  success: toStdout(['bold', 'green']),
};

export const errorColors = {
  error: toStderr('red'),
  warn: toStderr('yellow'),
  bold: toStderr('bold'),
};

/** Highlight the VERDICT line(s) in an agent's output. */
export function colorVerdicts(text: string): string {
  return text
    .replace(/^VERDICT:\s*PASS\b.*$/gim, (line) => colors.pass(line))
    .replace(/^VERDICT:\s*FAIL\b.*$/gim, (line) => colors.fail(line));
}

// ---- Log messages ------------------------------------------------------------------
export function logAuditStart(
  auditModel: string,
  auditEffort: string,
  iteration: number,
) {
  const bar = (ch: string) => ch.repeat(60);
  console.log(
    colors.audit(
      `\n${bar('=')}\n=== Iteration ${iteration}: AUDIT (${auditModel}/${auditEffort})\n${bar('=')}`,
    ),
  );
}

export function logAuditEnd(
  runOutput: {
    text: string;
    subtype: string;
    cost: number;
  },
  totalCost: number,
) {
  console.log(
    colorVerdicts(runOutput.text.trim()) || colors.dim('(no audit output)\n'),
  );
  console.log(
    colors.dim(
      `[audit ${runOutput.subtype}]  step $${runOutput.cost.toFixed(4)}  running $${totalCost.toFixed(4)}`,
    ),
  );
}

export function logAuditPass({
  cleanPasses,
  minimumCleanPasses,
  totalCost,
  totalRuns,
}: {
  cleanPasses: number;
  minimumCleanPasses: number;
  totalRuns: number;
  totalCost: number;
}) {
  console.log(colors.ok(`Clean audit (${cleanPasses}/${minimumCleanPasses})`));

  if (cleanPasses >= minimumCleanPasses) {
    console.log(
      colors.success(
        `\n[+] Converged after ${totalRuns} iterations. Total $${totalCost.toFixed(4)}`,
      ),
    );
  }
}

export function logAuditFail(subtype: string) {
  console.error(
    errorColors.error(`Audit did not complete cleanly (${subtype}); stopping.`),
  );
}

export function logFixStart(
  fixModel: string,
  fixEffort: string,
  iteration: number,
) {
  const bar = (ch: string) => ch.repeat(60);
  console.log(
    colors.fix(
      `\n${bar('-')}\n--- Iteration ${iteration}: FIX (${fixModel}/${fixEffort})\n${bar('-')}`,
    ),
  );
}

export function logFixEnd(
  runOutput: {
    text: string;
    subtype: string;
    cost: number;
  },
  totalCost: number,
) {
  console.log(runOutput.text.trim() || colors.dim('(no fix summary)'));
  console.log(
    colors.dim(
      `\n[fix ${runOutput.subtype}]  step $${runOutput.cost.toFixed(4)}  running $${totalCost.toFixed(4)}`,
    ),
  );
}

export function logFixNoChange() {
  console.error(
    errorColors.warn('\n[!] The fix step made NO change to the plan file.'),
  );
  console.error(
    errorColors.warn(
      '    Either there was nothing concrete to change, or the fixer',
    ),
  );
  console.error(
    errorColors.warn("    could not apply edits. Stopping so it doesn't spin."),
  );
}

export function logPlanUpdated() {
  console.log(colors.dim('\n    plan updated -> re-auditing...'));
}

export function logMaxIters(maxIters: number, totalCost: number) {
  console.error(
    errorColors.warn(
      `\n[!] Hit max-iters (${maxIters}) without converging. Total $${totalCost.toFixed(4)}`,
    ),
  );
}

export function logToolUse({
  turn,
  turnCap,
  toolName,
  detail,
}: {
  turn: number;
  turnCap: number;
  toolName: string;
  detail: string;
}) {
  console.log(
    `  ${colors.dim(`[${turn}/${turnCap}]`)} ${colors.tool(toolName)} ${colors.dim(detail)}`,
  );
}
