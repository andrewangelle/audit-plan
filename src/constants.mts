import { resolve } from 'node:path';
import type { EffortLevel } from '@anthropic-ai/claude-agent-sdk';
import { findRepoRoot } from '#src/utils.mjs';

export const REPO_ROOT = findRepoRoot();
export const PLANS_DIR = resolve(REPO_ROOT, '.claude/plans');

// Config
export const AUDIT_MODEL = 'opus'; // strong enough to verify claims
export const FIX_MODEL = 'sonnet'; // cheaper model for mechanical edits
export const EFFORT_LEVELS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const satisfies readonly EffortLevel[];

export const AUDIT_EFFORT: EffortLevel = 'high';
export const FIX_EFFORT: EffortLevel = 'medium';
export const REQUIRED_CLEAN = 2; // consecutive clean audits before declaring convergence
export const TURN_CAP = 30; // hard stop on tool-use round trips per call
export const LOAD_PROJECT_CONTEXT = false; // loads CLAUDE.md/skills; false saves tokens
export const MAX_ITERS = 8;
