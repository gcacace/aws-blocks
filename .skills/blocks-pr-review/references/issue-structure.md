# Issue Structure

## Severity Levels

### Baseline Issues (Step 5)

- 🔴 **BLOCKING**: Must fix before merge.
  - Correctness bugs, security vulnerabilities
  - Tenet violations (T1–T5) without documented trade-off
  - Decision log contradictions without proposed reversal
  - Missing BB checklist items (new BB PRs)
  - Type casts in customer-facing code (`as any`, `: any`)
  - Docstring removal or truncation on exported symbols
  - Missing changeset for published package changes
  - Broken conditional exports
  - Deploy-time dependency leaking into runtime bundle
  - Mock/runtime parity gap without DESIGN.md documentation
  - Breaking change without escalation
- 🟡 **RECOMMENDED**: Important improvements. Standards deviations, incomplete docs, best practice gaps.
- 🟢 **OPTIONAL**: Nice-to-have enhancements.

### Excellence Opportunities (Step 6)

- 🌟 **HIGH IMPACT**: Significant design or usability improvements
- 💡 **MEDIUM IMPACT**: Meaningful improvements worth the effort
- ✨ **NICE TO HAVE**: Minor quality enhancements

## Baseline vs Excellence

| Aspect | Baseline | Excellence |
|--------|----------|------------|
| Purpose | Prevent correctness, security, tenet, and decision violations | Improve design, usability, long-term quality |
| Action | Must fix | Opportunity to elevate |
| Examples | Tenet violation, decision contradiction, type cast in e2e, broken parity | Better error messages, more intuitive API, improved mock fidelity |

When in doubt, frame as an excellence opportunity with clear reasoning.

## Issue Formatting

Line numbers MUST be derived by running `gh pr diff <pr_number> --repo <owner/repo> | .skills/blocks-pr-review/scripts/diff-line-map.sh` and searching the output for the relevant code. Use `--file path/to/file.ts` to filter. Do NOT count lines manually.

### Baseline Issue Format

```
- Severity emoji
- **File:** `path/to/file.ts` (lines X-Y)
- **Source:** [Agent Review] or [Regression — previously caught by @reviewer]
- **Evidence:** [Tenet T2] or [Decision D-003] or [CONTRIBUTING.md § Quality Checklist] or [A0-API-DESIGN.md § Error Handling]
- Clear explanation
- Current code snippet
- Recommended fix with code
```

### Excellence Opportunity Format

```
- Impact indicator (🌟/💡/✨)
- Clear explanation with reasoning
- Recommended approach with code examples
```
