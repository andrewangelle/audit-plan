type AuditPromptArgs = {
  plan: string;
  scope: string;
  testsClause: string;
};

type FixPromptArgs = {
  plan: string;
  findings: string;
};

export const AUDIT_PROMPT = ({
  plan,
  scope,
  testsClause,
}: AuditPromptArgs) => `\
You are a skeptical staff engineer reviewing an implementation plan that another
agent will execute. ASSUME the plan contains incorrect assumptions until you have
verified otherwise against the actual codebase.

The plan is at: ${plan}
Restrict your investigation to these paths (read/grep only what you need here):
${scope}

For every assumption the plan makes about existing code -- function signatures,
exported symbols, file locations, data shapes${testsClause} -- VERIFY it by reading
the relevant files or grepping. Do not speculate, and do not read files outside the
scoped paths unless a scoped file directly references them.

Report ONLY issues you can back with concrete evidence. For each, give:
  - the plan's claim
  - the contradicting evidence (file:line or grep result)
  - the concrete fix

Be efficient: read the plan once, verify the specific claims, then decide. Do not
re-read files you have already seen.

Put all of your explanation and findings ABOVE the verdict. Then finish with a
single final line that is EXACTLY one of the following, with no other text on that
line (no parentheses, no commentary):
VERDICT: PASS
VERDICT: FAIL
`;

export const FIX_PROMPT = ({ plan, findings }: FixPromptArgs) => `\
Revise the implementation plan at ${plan} to resolve every issue in the audit
findings below. Edit the file in place. Preserve its structure and intent; change
only what the findings require, and update any downstream steps that depended on a
corrected assumption. Do not add unrelated content. Do not mark anything resolved
that you did not actually change.

When done, briefly summarize what you changed.

Audit findings:
${findings}
`;
