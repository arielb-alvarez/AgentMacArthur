# AgentMacArthur — Retrospective Engineering Audit

**Audit date:** 2026-11-17
**Branch:** `feature/organization-management`
**Audit type:** Retrospective source-based engineering and security review
**Status:** In progress — verification completed for selected areas; remediation outstanding

---

## 1. Executive Summary

The retrospective audit identified the following findings:

| Severity | Findings |
|---|---:|
| Critical | 0 established |
| High | 1 |
| Medium | 14 |
| Low | 20+ |

These findings reflect the source files, tests, and implementation details reviewed during the audit. This was not an exhaustive review of every repository file, nor an independent penetration test.

The invitation module has completed focused automated verification, including PostgreSQL integration tests for concurrency scenarios. The full automated test suite also passes.

**Important:** Passing tests and coverage thresholds demonstrate automated verification. They do not establish that all security, architecture, or operational findings have been remediated.

## 2. Audit Scope and Limitations

The review has focused on:

- Authentication and session management
- Email verification and account lifecycle
- Organization and project management
- Role and permission architecture
- Organization invitations
- Conversation access and authorization
- Database transactions and concurrency
- API middleware and request security
- Automated tests and coverage

The review was based on supplied source code, test files, implementation discussions, and executed test results.

The following were not established as completed:

- Exhaustive line-by-line review of the entire repository
- Independent penetration testing
- Production deployment verification
- Load and stress testing
- External security assessment
- Full remediation of every audit finding

## 3. Verified Automated Test Results

### 3.1 Full project test suite

**Execution:** `npx vitest run --coverage`

| Metric | Result |
|---|---:|
| Test files passed | 64 / 64 |
| Tests passed | 653 / 653 |
| Test failures | 0 |
| Duration | 55.01 seconds |

### 3.2 Overall coverage

| Coverage metric | Result |
|---|---:|
| Statements | 97.36% |
| Branches | 93.41% |
| Functions | 98.49% |
| Lines | 97.41% |

All reported coverage thresholds passed.

### 3.3 Invitation module coverage

| Component | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| Invitation service | 94.36% | 90.00% | 100% | 94.32% |
| Invitation repository | 100% | 96.42% | 100% | 100% |

Uncovered lines remain in the invitation service. These should be assessed for meaningful missing behavior rather than automatically covered with artificial tests.

## 4. Invitation Module Verification

Focused invitation tests:

**Execution:** `npx vitest run tests/unit/invitation tests/integration/invitation.repository.test.ts tests/integration/invitation.service.test.ts`

| Metric | Result |
|---|---:|
| Test files passed | 5 / 5 |
| Tests passed | 100 / 100 |
| Failures | 0 |

### 4.1 Concurrency scenarios verified

The integration tests exercise real PostgreSQL transactions and locking behavior.

| Scenario | Expected behavior | Result |
|---|---|---|
| Concurrent acceptance | Only one acceptance succeeds | Passed |
| Revocation before acceptance obtains its lock | Acceptance is rejected | Passed |
| Resend replaces token before acceptance obtains its lock | Old token is rejected; replacement token works | Passed |
| Acceptance obtains the invitation row lock before resend | Acceptance commits; resend returns conflict | Passed |
| Role assignment fails during acceptance | Membership and invitation changes roll back | Passed |

### 4.2 Locking design reviewed

Acceptance uses an organization-and-normalized-email advisory transaction lock, followed by a locked invitation lookup using `SELECT ... FOR UPDATE`.

Resend uses a conditional update that requires the invitation to remain pending and unexpired. The database row lock serializes this update against acceptance.

The tested race orderings behaved as expected. No production code changes were required to achieve these test results.

**Invitation verification conclusion:** The tested invitation acceptance, token rotation, revocation, and concurrency behaviors passed. This does not replace the remaining cross-module security and architecture review.

## 5. Previously Reviewed Findings

The following items remain relevant to the wider audit.

### 5.1 Authentication and account lifecycle

| Finding | Severity | Status |
|---|---|---|
| Email verification resend/recovery workflow is missing | Medium | Open |
| Failed verification email delivery can leave a pending account without a usable recovery path | Medium | Open |
| Account suspension lacks a centralized orchestration service that also handles session lifecycle | Medium | Open |
| Unknown-user login skips password verification, creating a potential timing difference | Low | Open |
| Session `last_used_at` is updated on every authenticated request, creating avoidable write activity | Low | Open |

The existing authentication flow, password hashing, token hashing, session validation, and email verification transaction behavior were reviewed. The findings above are not claims that authentication is broadly broken.

### 5.2 Organization and project authorization

| Finding | Severity | Status |
|---|---|---|
| Project services still rely on legacy role columns rather than the canonical permission engine | High | Open |
| Project access queries do not consistently honor custom roles and multiple role assignments | Medium | Open |
| Custom role assignment is not supported by the current role-assignment repository | Medium | Open |
| Project-member repository lacks update, removal, suspension, and reactivation operations | Medium | Open |
| Organization member listing exposes member email, display name, status, and roles to active organization members; access policy needs confirmation | Medium | Policy decision required |
| Technical leads cannot manage project metadata or status under the currently seeded permissions | Low | Policy decision required |

The canonical permission repository supports organization and project permission checks, including custom-role permission queries. However, the project service's continued use of legacy role fields creates an authorization consistency gap.

### 5.3 Request security

| Finding | Severity | Status |
|---|---|---|
| Organization and project mutation routes lack consistent trusted-origin enforcement | Medium | Open |
| Existing route tests do not comprehensively verify missing and untrusted Origin behavior for organization and project writes | Low | Open |
| Rate limiting uses an in-memory store and is not shared across multiple application instances | Medium | Deployment/scaling consideration |
| Reverse-proxy trust configuration has not been established | Low | Deployment review required |

CORS allowlisting and server-side trusted-origin validation are separate controls. SameSite cookies reduce some cross-site request risks but should not be treated as a replacement for explicit origin protection.

### 5.4 Invitation implementation

The invitation module passed the focused and full regression test runs documented above.

Additional review items should remain visible until the broader authorization and operational audit is closed. Passing invitation tests does not establish that every invitation policy or deployment scenario has been independently assessed.

### 5.5 Conversation architecture

The conversation implementation introduces scoped personal, organization, and project conversations.

The agreed transaction design is:

1. Authorize access and append the user's message in one transaction.
2. Call the AI provider outside the database transaction.
3. Recheck participation permission before appending the assistant response in a second transaction.
4. If permission has been revoked during generation, retain the user's message, do not persist the assistant response, and return `403`.

New conversations require explicit scope information. Existing conversations derive their scope and ownership from the database rather than trusting client-supplied scope data.

The following verification remains necessary:

- Dedicated integration coverage for scoped conversation authorization
- Permission revocation during AI generation
- Provider failure and message persistence behavior
- Personal, organization, and project tenant isolation
- Existing conversation ownership and scope enforcement

## 6. Agreed Engineering Decisions

The following decisions were agreed during the audit:

1. Preserve the current worktree and uncommitted changes.
2. Do not stage, commit, push, merge, reset, clean, or switch branches unless explicitly requested.
3. Do not change production code before understanding a finding and agreeing on its remediation.
4. Complete the retrospective audit before resuming new feature development.
5. Establish permanent quality gates after the audit.
6. Use a modular monolith architecture rather than prematurely introducing microservices.
7. Keep approval management separate from agent chat responsibilities.
8. Use centralized, permission-based organization and project authorization.
9. Treat the AI as an advisory and execution system operating within human-defined governance and approval policies.
10. Preserve traceability for approvals, decisions, execution, and outcomes.

## 7. Remediation Tracking

The following areas should be addressed in a deliberate order:

| Priority | Area | Next action | Status |
|---|---|---|---|
| 1 | Project authorization consistency | Review and agree on migration from legacy role checks to canonical permissions | Open |
| 2 | Trusted-origin enforcement | Review mutation route coverage and middleware placement | Open |
| 3 | Role assignment | Define and implement custom role assignment lifecycle | Open |
| 4 | Account lifecycle | Design verification recovery and suspension orchestration | Open |
| 5 | Conversation security | Complete scoped authorization and revocation integration tests | Open |
| 6 | Organization member privacy | Confirm visibility policy and enforce it consistently | Policy decision |
| 7 | Deployment readiness | Review proxy trust and shared rate-limit strategy | Open |

No remediation should be marked complete without corresponding implementation evidence and appropriate tests.

## 8. Quality Gate Requirements

Permanent quality gates should include:

- TypeScript compilation
- Unit tests
- Database integration tests
- Full regression suite
- Coverage thresholds
- Migration integrity and checksum validation
- Authorization tests for both allowed and denied access
- Tenant-isolation tests
- Trusted-origin tests for state-changing routes
- Concurrency tests for sensitive transactional workflows
- OpenAPI contract consistency
- Dependency and security audit checks

A passing test suite must not be treated as a substitute for reviewing security-sensitive changes.

## 9. Current Audit Conclusion

The invitation module has passed focused testing and the full project regression suite.

The full project reports:

- 653 passing tests
- 64 passing test files
- 97.36% statement coverage
- 93.41% branch coverage
- 98.49% function coverage
- 97.41% line coverage

The audit remains **in progress** because several architectural, authorization, and operational findings are still open.

The next objective is to review and prioritize the outstanding findings, agree on remediation, and establish permanent quality gates before resuming feature development.

---

**Audit record last updated:** 2026-11-17
**Overall status:** In progress