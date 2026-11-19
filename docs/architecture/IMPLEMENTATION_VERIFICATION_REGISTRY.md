# AgentMacArthur — Implementation Verification Registry

**Version:** 1.0
**Status:** Initial governance specification
**Purpose:** Track implementation responsibilities, dependencies, and verification evidence.

---

## 1. Purpose

The Implementation Verification Registry records what has been inspected, understood, and verified in AgentMacArthur.

It complements the Architecture Dependency Map:

- Architecture Dependency Map: Where implementations and dependencies are located.
- Implementation Verification Registry: What has been verified and what evidence supports that verification.
- Implementation Registry JSON: Structured source of truth used by automated tools.
- Change Impact Checker: Detects source changes and identifies potentially affected implementations.

The objective is to reduce repeated source inspection without reducing engineering quality.

## 2. Core principles

1. Every independently meaningful implementation responsibility receives a stable implementation ID.
2. Implementation IDs remain stable across file renames and internal refactoring whenever the responsibility remains substantially the same.
3. Every implementation record identifies its source files, dependencies, and relevant tests.
4. File existence does not establish implementation correctness.
5. Passing tests does not automatically establish that source code has been reviewed.
6. A source change invalidates relevant verification evidence, not necessarily the correctness of the implementation.
7. Shared dependency changes must be evaluated against dependent implementations.
8. Verification history must be preserved.
9. Change detection must include uncommitted changes.
10. Automated tools must not silently mark implementations as verified.

## 3. Implementation identifiers

Use the following format:

`IMPL-{MODULE}-{SEQUENCE}`

Examples:

- `IMPL-AUTH-001`
- `IMPL-ORG-MEMBER-001`
- `IMPL-INV-001`
- `IMPL-CHAT-001`
- `IMPL-PERM-001`
- `IMPL-PROJECT-001`

Identifiers are permanent.

Do not reuse an identifier for an unrelated responsibility.

If a responsibility is split into multiple independently verifiable implementations, retain the original identifier for the continuing responsibility and create new identifiers for the new responsibilities.

If two responsibilities are consolidated, preserve the historical records and document the relationship.

## 4. Implementation record structure

The structured registry is maintained in:

`docs/architecture/implementation-registry.json`

Each implementation record should contain:

| Field | Description |
|---|---|
| id | Permanent implementation identifier |
| name | Short implementation name |
| module | Owning feature or shared module |
| responsibility | Behavior owned by the implementation |
| source_files | Files directly implementing the responsibility |
| dependencies | Other implementation IDs relied upon |
| test_files | Tests that provide verification evidence |
| status | Current verification status |
| last_verified_revision | Git revision used during verification |
| verified_file_hashes | Source file hashes recorded at verification |
| verification_history | Historical verification records |
| notes | Relevant implementation constraints |

Paths must be repository-relative and use forward slashes.

A file may belong to multiple implementation records when it serves multiple responsibilities.

## 5. Verification statuses

Use these statuses:

### not_verified

The implementation has not yet received sufficient source review and verification.

### partially_verified

Some responsibilities or verification activities have been completed, but the implementation does not yet meet the full verification criteria.

### verified

The implementation has received an appropriate source review and the required tests have passed.

### stale

Relevant source files or dependencies have changed since the recorded verification. Previous evidence must be reconsidered.

### blocked

Verification cannot be completed because a required dependency, environment, test, or other prerequisite is unavailable.

A status must never be upgraded automatically merely because a file has not changed.

## 6. Verification requirements

A verified implementation should have evidence appropriate to its responsibility.

Record these separately:

1. Path verification: The documented source and test files exist.
2. Responsibility verification: The implementation's actual behavior has been inspected.
3. Dependency verification: Relevant interactions and dependencies have been inspected.
4. Test verification: Relevant automated tests have passed.
5. Integration verification: Relevant cross-module behavior has been tested when applicable.

Not every implementation requires every type of test, but omissions must be justified.

A test result must record:

- Test command.
- Test scope.
- Execution date.
- Result.
- Any known limitations.

A full source review must not be claimed when only tests or build checks were executed.

### Focused implementation verification

A dedicated implementation record may be marked `verified` when its narrowly
defined responsibility has undergone a focused review of the relevant source
code and dependencies, and its applicable tests and validation checks have
passed.

This does not imply that the broader module, neighboring implementations, or
repository has received a complete review. The verification history must state
the review scope and explicitly identify relevant limitations.

## 7. Change detection

The change-impact checker will compare the current working tree against each implementation's recorded verification baseline.

Detection must include:

- Modified tracked files.
- Added files.
- Deleted files.
- Renamed files.
- Uncommitted changes.
- Changes committed after the verification baseline.

The primary comparison must use recorded file-content hashes, not Git commit history alone.

Git history and diffs provide additional context.

This ensures that uncommitted edits are not overlooked.

## 8. Dependency-aware invalidation

When a source file changes:

1. Identify every implementation record referencing that file.
2. Mark those records as potentially stale.
3. Identify implementations depending on those records.
4. Determine whether each dependent implementation is actually affected.
5. Recommend relevant tests and inspections.

Do not automatically invalidate unrelated implementations.

A shared dependency change requires impact analysis across all registered consumers.

A test-only change invalidates the corresponding test evidence. It does not automatically establish that production implementation code is incorrect.

A documentation-only change does not invalidate implementation verification unless it changes or exposes a behavior or dependency discrepancy.

## 9. Verification baseline

Each verification record must identify:

- Git revision at verification time.
- Source file hashes at verification time.
- Test commands and results.
- Review scope.
- Verification date.
- Known limitations.

The Git revision identifies the repository baseline.

The file hashes identify the actual source content verified, including when the working tree contained uncommitted changes.

A later source change makes the relevant baseline stale.

Reverification creates a new record. It must not erase previous evidence.

## 10. Change-impact workflow

Every implementation change follows this process:

1. Understand the requested behavior and acceptance criteria.
2. Consult the Architecture Dependency Map.
3. Identify relevant implementation IDs.
4. Run change-impact detection.
5. Identify primary, indirect, and shared dependencies.
6. Inspect only missing, changed, or insufficiently verified source.
7. Prepare and approve the implementation plan.
8. Implement the approved changes.
9. Run focused tests and broader checks when appropriate.
10. Review the actual changes and test evidence.
11. Update implementation records and verification history.
12. Update the Architecture Dependency Map when paths, dependencies, responsibilities, or architectural decisions change.

## 11. Implementation annotations

Source annotations may reference implementation IDs.

Example:

    /**
     * @implementation IMPL-ORG-MEMBER-001
     * @responsibility Basic organization member directory.
     */

Annotations are optional navigation aids.

They do not replace the structured registry and must not be treated as automated proof of implementation correctness.

## 12. Change-impact checker

The planned checker is:

`scripts/architecture/check-implementation-changes.ts`

Initially, it must be read-only.

It should:

- Read the structured registry.
- Inspect Git changes and working-tree content.
- Compare file hashes with recorded verification baselines.
- Identify directly affected implementation records.
- Identify dependent implementation records.
- Report missing or deleted paths.
- Recommend relevant tests.
- Distinguish production source changes from test-only changes.
- Never modify source files or mark implementations verified.

The checker must not stage, commit, reset, clean, checkout, merge, or push Git changes.

## 13. Verification ownership

Verification status is evidence-based.

The developer or reviewer must explicitly confirm that the required review and testing have been completed before a record is marked verified.

Automated change detection may mark records stale or report potential impact.

It must never independently certify correctness.

## 14. Registry maintenance

Update the registry when:

- A new implementation is introduced.
- A responsibility changes.
- A source or test path changes.
- A dependency is added or removed.
- A permission or authorization rule changes.
- A database migration changes implementation behavior.
- Verification is completed.
- An implementation is deprecated or replaced.

Update the Architecture Dependency Map when architectural structure or dependency information changes.

Keep both documents consistent.

## 15. Initial rollout

The registry will be introduced incrementally.

Phase 1 — Documentation and structured registry.

Phase 2 — Register existing implementations using previously inspected source and available test evidence.

Phase 3 — Implement read-only Git-based change detection.

Phase 4 — Validate dependency-aware invalidation against real feature changes.

Phase 5 — Integrate checks into development workflows and CI.

Existing implementations must not be marked verified solely because their paths appear in the Architecture Dependency Map.

Unknown or insufficiently inspected implementations remain not_verified or partially_verified.

---

**End of Implementation Verification Registry**
