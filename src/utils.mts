import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { styleText } from 'node:util';
import { PLANS_DIR } from '#src/constants.mjs';

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

export function sha(path: string): string {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch {
    return '';
  }
}

/** True only if the last VERDICT line says PASS. Tolerates trailing text. */
export function verdictIsPass(text: string): boolean {
  const verdicts = [...text.matchAll(/^VERDICT:\s*(PASS|FAIL)\b/gim)];
  return verdicts.length > 0 && verdicts.at(-1)?.[1].toUpperCase() === 'PASS';
}

export const isFile = (filePath: string) =>
  existsSync(filePath) && statSync(filePath).isFile();

/** A path (relative to where you ran the command) first, then a name in .claude/plans/. */
export function resolvePlan(arg: string): string | undefined {
  // `npm run` switches cwd to the package root; INIT_CWD is where you actually were.
  const callerDir = process.env.INIT_CWD ?? process.cwd();

  const candidates = [
    resolve(callerDir, arg),
    resolve(PLANS_DIR, arg),
    resolve(PLANS_DIR, `${arg}.md`),
  ];

  return candidates.find(isFile);
}

export function findRepoRoot(): string {
  // `npm run` moves cwd to the package root; INIT_CWD is where you actually ran it.
  const start = process.env.INIT_CWD ?? process.cwd();

  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: start,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'], // hide git's "not a git repository" noise
    }).trim();
  } catch {
    // Not inside a git repo, or git isn't installed.
    return start;
  }
}
