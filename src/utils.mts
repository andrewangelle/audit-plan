import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { PLANS_DIR } from '#src/constants.mjs';

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
