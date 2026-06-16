# PR Comment Format Reference

## Comment Template

Each comment has three parts:

1. **Heading** (for reviewer navigation): file path and line numbers
2. **Hidden metadata** (invisible when pasted): GitHub review comment fields
3. **Comment body** (what gets pasted): severity, observation, impact, evidence, suggestion

```markdown
### `{file_path}` L{start}-L{end}

<!-- gh-comment
file: {file_path}
startLine: {start}
endLine: {end}
side: RIGHT
-->

**{Severity}**

{Observation — what the issue is, 1-2 sentences, specific, referencing the code}

{Impact — why it matters, what happens if not addressed}

{Evidence — reference to API guidelines, CONTRIBUTING.md, existing BB, or tech design doc}

{Suggestion — concrete fix with code example, or a question framing an alternative approach}

---
```

For single-line comments, `startLine` and `endLine` are the same, and the heading uses just `L{line}`.

## Full Example

```markdown
### `packages/bb-kv-store/src/index.mock.ts` L42-L48

<!-- gh-comment
file: packages/bb-kv-store/src/index.mock.ts
startLine: 42
endLine: 48
side: RIGHT
-->

**Suggestion**

The `get()` method returns `undefined` for missing keys but the JSDoc says it throws `KvStoreErrors.KEY_NOT_FOUND`. The mock layer must match the documented contract — customers writing code against the mock will hit different behavior in production.

Per `A0-API-DESIGN.md` § Error Handling: "Error constants must be thrown consistently across mock and AWS runtime layers."

Consider throwing the error constant to match the AWS runtime:

​```ts
if (!this.store.has(key)) {
  throw KvStoreErrors.KEY_NOT_FOUND;
}
​```

---
```

## Severity Levels

Three levels, rendered in bold text with no emoji:

- **Blocking** — Must fix before merge. Correctness, security, breaking changes, missing checklist items, type casts in customer code, docstring removal.
- **Suggestion** — Strongly recommended. Better design, consistency, robustness. Won't block merge but should be addressed.
- **Nit** — Take it or leave it. Style, naming, minor improvements.

## Evidence & References

Every non-trivial comment MUST cite at least one source. Types in order of authority:

1. **API Design Guidelines** — `docs/tech-design/A0-API-DESIGN.md` for API convention claims
2. **CONTRIBUTING.md** — for checklist, workflow, and quality standard claims
3. **AGENTS.md** — for project conventions and agent rules
4. **Existing Building Block** — `packages/bb-kv-store/` as the canonical reference implementation
5. **Tech Design Docs** — `docs/tech-design/BB-*.md` or numbered design docs for design intent
6. **Decision Log** — `docs/DECISIONS.md` for past decisions that constrain current work
7. **Linked issue / PR discussion** — for customer context

References are not needed for: pure style nits, obvious code issues (typos, unused imports), or genuine questions.

## Filtering — What Becomes a Comment

A finding becomes a comment only when it meets all three criteria:

1. **Tied to a specific code location** — has a file and line number
2. **Actionable** — there's a concrete change the contributor can make
3. **Significant enough to stand alone** — worth the contributor's individual attention

What stays in the report only (not a comment):
- High-level design observations not tied to a specific line
- Positive feedback / "what's done well"
- Clusters of related nits — consolidate into one comment on the first occurrence
- Philosophical questions for the contributor
- Observations without a concrete fix

### Severity-based filtering

| Severity | Comment? | Rule |
|----------|----------|------|
| **Blocking** | Always | Every blocking issue becomes a comment. |
| **Suggestion** | Usually | Comment if tied to specific code. Consolidate related ones. |
| **Nit** | Sparingly | Only if it's a quick fix and worth the contributor's individual attention. |

All findings that meet the three filtering criteria become comments — there is no comment budget.

## Tone Rules

- Use "we" and "consider" instead of "you should"
- Frame suggestions as questions when possible: "What do you think about..." / "Have you considered..."
- For blocking issues, be direct but not harsh: "This needs to change because..." not "This is wrong"
- Acknowledge good work when relevant
- Never use "obviously" or "simply"
- Every comment must include a concrete fix or suggestion — never just point out a problem
