# Review Report Template

## Required Structure

The review report MUST follow this exact section order:

### 1. Title
`# Bar-Raising PR Review: #<pr_number>`

### 2. Review Timestamp
Full ISO 8601 format (e.g., `2026-04-22T14:20:00Z`).

### 3. PR Summary
Table with columns: Title, Author, Type (new BB / BB modification / core / docs / test / CI), Packages Affected, Linked Issue.

### 4. Change Overview
What changed, which layers are affected (mock, AWS runtime, CDK, browser stub, types, docs), files/lines count.

### 5. Tenet Alignment
Table with columns: Tenet, Status (✅ Upheld / ⚠️ At Risk / ❌ Violated), Evidence. One row per tenet (T1–T5). Violations must reference the specific code and explain the conflict.

### 6. Decision Log Compliance
Table with columns: Decision ID, Title, Status (✅ Consistent / ❌ Contradicted), Notes. One row per relevant decision. If no decisions are relevant, state that explicitly.

### 7. Building Block Checklist (if applicable)
If the PR introduces a new BB: table with columns: Item, Status (✅/❌), Notes. Every item from the BB Implementation Checklist in `CONTRIBUTING.md`.

### 8. Baseline Issues
Organized by severity: 🔴 BLOCKING → 🟡 RECOMMENDED → 🟢 OPTIONAL.

For each issue:
- **File:** `path/to/file.ts` (lines X-Y)
- **Source:** [Agent Review] or [Regression]
- **Evidence:** tenet ID, decision ID, CONTRIBUTING.md section, or A0 guideline
- Clear explanation, current code, recommended fix

### 9. Layer Parity Assessment
Table with columns: Behavior, Mock, AWS Runtime, CDK, Aligned? (✅/❌). Key behaviors that must be consistent across layers.

### 10. Excellence Opportunities
Organized by impact: 🌟 HIGH → 💡 MEDIUM → ✨ NICE TO HAVE. Do NOT repeat baseline issues. Focus on design quality beyond correctness.

### 11. Test Coverage Assessment
Table with columns: Test File, Unit Tests, E2E Tests, Type Safety (no casts), Assessment.

### 12. What's Done Well
Numbered list of strengths.

### 13. Key Questions for Contributor
At least 3 thought-provoking questions.

### 14. Summary
Overall assessment and path to excellence.

### 15. PR Comments (Copy-Paste Ready)
Generated in Step 6, appended here.

## Formatting Rules

- Baseline issues MUST include: severity emoji, file path with lines, source, evidence reference, explanation, current code, recommended fix
- Excellence opportunities MUST include: impact indicator, explanation with reasoning, code example
- Baseline and excellence MUST be clearly separated
- Every suggestion MUST include reasoning
- Use tables for structured comparisons
- Use horizontal rules (`---`) to separate major sections
