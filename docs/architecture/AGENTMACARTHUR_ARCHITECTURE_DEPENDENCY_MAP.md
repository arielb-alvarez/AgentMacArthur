# AgentMacArthur - Architecture & Dependency Map

**Version:** 1.1
**Baseline date:** 2026-11-17
**Status:** Living engineering reference
**Architecture:** Node.js 22 | TypeScript | Express | PostgreSQL | Modular Monolith
**Testing:** Vitest | Supertest

> Purpose: Reduce repeated repository scanning. Use this map as the first place to identify which files, contracts, dependencies, and tests to inspect before changing a feature.

> Inventory limitation: Paths in Sections 3-5 were confirmed from the repository file inventory supplied on 2026-11-17. A confirmed path does not mean the file's implementation has been inspected. Responsibility and behavior are marked as inspected only where source contents were actually reviewed.

---

## 1. How we use this map

For every feature change:

1. Find the feature in the Feature Dependency Register.
2. Inspect its listed source files first; do not rescan the entire repository by default.
3. Follow cross-module dependencies only where the change crosses a contract or behavior boundary.
4. Check the relevant migration, permission definitions, and tests.
5. Run focused tests first. Run broader tests when shared contracts, schema, permissions, transaction boundaries, or middleware change.
6. Update this file in the same work session whenever paths, dependencies, decisions, or test evidence change.
7. Record exactly which files were inspected and which tests were run. A path inventory is not a code review.

### Path verification labels

- **PATH VERIFIED:** The file path was present in the repository inventory.
- **RESPONSIBILITY INSPECTED:** The file contents were supplied and reviewed for the relevant behavior.
- **NOT YET INSPECTED:** Path is known, but its implementation has not been reviewed for the current task.
- **PLANNED:** Module or implementation does not yet exist.
- **TEST PATH VERIFIED:** Test file path exists in the supplied inventory. This does not establish that every behavior in that test was reviewed.

## 2. Architecture principles

- **Modular monolith:** Modules are separated by responsibility but share one application process and PostgreSQL database.
- **Layer boundaries:** Routes/middleware -> controllers -> application services -> repository interfaces -> PostgreSQL repositories.
- **Dependency injection:** Containers/composition roots wire concrete repositories and services.
- **PostgreSQL is the system of record.**
- **Forward-only schema evolution:** Add new migrations; never edit an applied migration.
- **Tenant boundaries:** Every service authorization path and repository query must preserve organization/project scope.
- **Canonical authorization:** Use scoped roles, permissions, `role_permissions`, `organization_member_roles`, and `project_member_roles`; avoid introducing new legacy-role checks.
- **Transaction discipline:** Multi-repository state changes must share the transaction client. AI provider calls stay outside database transactions.
- **Governance:** Permission to perform an action and satisfaction of an approval policy are separate checks.
- **Product principle:** "The AI proposes. Humans govern. The AI executes. The system verifies and records."
- Do not stage, commit, push, merge, reset, checkout, or clean the worktree unless explicitly requested.

## 3. Shared dependency index

| Shared component | Exact paths | When to inspect |
|---|---|---|
| App/composition root | `src/app.ts`, `src/server.ts`, `src/server-startup.ts`, `src/server-lifecycle.ts` | Runtime wiring, middleware, route registration, startup/shutdown |
| Dependency containers | `src/container/agent.container.ts`, `src/container/auth.container.ts`, `src/container/email.container.ts`, `src/container/invitation.container.ts`, `src/container/organization.container.ts`, `src/container/project.container.ts` | Constructor/dependency changes, new service/repository |
| PostgreSQL and transactions | `src/config/database.ts`, `src/database/transaction-manager.ts` | Transactions, locking, rollback, client propagation, pool lifecycle |
| Migration runner | `src/database/migrate.ts`, `src/database/migrate-status.ts`, `src/database/migration.runner.ts` | Migration execution, checksums, locking, status |
| Authentication/session middleware | `src/middleware/auth.middleware.ts`, `src/auth/session-cookie.ts`, `src/sessions/session.repository.ts`, `src/sessions/postgres-session.repository.ts` | Protected routes, session validity, account status |
| Canonical permission system | `src/permissions/organization-permission.service.ts`, `src/permissions/organization-permission.repository.ts`, `src/permissions/postgres-organization-permission.repository.ts` | Authorization, role changes, scoped access |
| Trusted-origin protection | `src/middleware/trusted-origin.middleware.ts` | Cookie-authenticated POST/PATCH/PUT/DELETE routes |
| Validation and API contract | `src/middleware/validate.middleware.ts`, feature validators, `src/docs/openapi.ts` | Request/response changes and new endpoints |
| Error handling | `src/errors/app.error.ts`, `src/middleware/error.middleware.ts` | Error contracts and operational/non-operational boundaries |
| Logging/request context | `src/utils/logger.ts`, `src/middleware/request-id.middleware.ts`, `src/middleware/request-logger.middleware.ts` | Diagnostics, request context, sensitive data |
| Email | `src/email/email.service.ts`, `src/email/development-email.service.ts` | Verification/invitation delivery and retry behavior |
| AI/chat | `src/agent/agent-chat.service.ts`, `src/agent/agent-provider.ts`, `src/agent/agent-provider.factory.ts` | Provider calls, prompts, conversation orchestration |
| Environment/configuration | `src/config/env.ts` | Environment variables, production configuration |
| Express request types | `src/types/express.d.ts` | Request identity/context changes |

## 4. Feature dependency register

All listed paths were present in the supplied source inventory. Files specifically reviewed are identified in the relevant audit notes. Other listed files remain NOT YET INSPECTED for a particular change until their contents are reviewed.

### 4.1 Authentication and sessions

**Source files**
- `src/auth/auth.service.ts`
- `src/auth/email-verification.service.ts`
- `src/auth/password.service.ts`
- `src/auth/registration.service.ts`
- `src/auth/session-cookie.ts`
- `src/auth/token.service.ts`
- `src/auth-tokens/auth-token.repository.ts`
- `src/auth-tokens/auth-token.types.ts`
- `src/auth-tokens/postgres-auth-token.repository.ts`
- `src/sessions/postgres-session.repository.ts`
- `src/sessions/session.repository.ts`
- `src/sessions/session.types.ts`
- `src/users/postgres-user.repository.ts`
- `src/users/user.repository.ts`
- `src/users/user.service.ts`
- `src/users/user.types.ts`
- `src/controllers/auth.controller.ts`
- `src/routes/auth.routes.ts`
- `src/container/auth.container.ts`
- `src/container/email.container.ts`
- `src/middleware/auth.middleware.ts`
- `src/validators/auth.validator.ts`

**Tests**
- `tests/integration/auth-token.repository.test.ts`
- `tests/integration/auth.service.test.ts`
- `tests/integration/email-verification.service.test.ts`
- `tests/integration/session.repository.test.ts`
- `tests/integration/user.repository.test.ts`
- `tests/integration/user.service.test.ts`
- `tests/unit/auth.controller.test.ts`
- `tests/unit/auth.middleware.test.ts`
- `tests/unit/auth.routes.test.ts`
- `tests/unit/auth.service.test.ts`
- `tests/unit/auth.validator.test.ts`
- `tests/unit/email-verification.service.test.ts`
- `tests/unit/password.service.test.ts`
- `tests/unit/registration.service.test.ts`
- `tests/unit/session-cookie.test.ts`
- `tests/unit/token.service.test.ts`
- `tests/unit/user.service.test.ts`

**Dependencies**
- `users`, `sessions`, `auth_tokens`
- Password/token hashing and cookie configuration
- Trusted-origin middleware and rate limiting
- Email verification and account status
- TransactionManager

**Verify**
- Login/logout/verification behavior
- Expiry and revocation
- Active/verified/suspended account behavior
- Origin and rate-limit behavior
- No secrets/tokens/passwords in logs
- Registration and personal workspace creation are atomic

### 4.2 Registration and personal workspace

**Source files**
- `src/auth/registration.service.ts`
- `src/users/user.service.ts`
- `src/users/user.repository.ts`
- `src/users/postgres-user.repository.ts`
- `src/organizations/organization.repository.ts`
- `src/organizations/organization.service.ts`
- `src/organizations/organization.types.ts`
- `src/organizations/postgres-organization.repository.ts`
- `src/role-assignments/role-assignment.repository.ts`
- `src/role-assignments/postgres-role-assignment.repository.ts`
- `src/container/auth.container.ts`
- `src/container/organization.container.ts`
- `src/container/email.container.ts`

**Tests**
- `tests/integration/user.service.test.ts`
- `tests/integration/user.repository.test.ts`
- `tests/integration/organization.service.test.ts`
- `tests/integration/role-assignment.repository.test.ts`
- `tests/unit/registration.service.test.ts`
- `tests/unit/user.service.test.ts`

**Dependencies**
- User creation
- Personal organization/workspace creation
- Legacy `organization_members` owner row
- Canonical organization owner role assignment
- Verification token and email delivery
- One transaction boundary

**Verify**
- User + personal organization + owner role are atomic
- Failure at any step rolls back the whole operation
- Verification delivery failure has a recoverable path

### 4.3 Organization management

**Source files**
- `src/organizations/organization.repository.ts`
- `src/organizations/organization.service.ts`
- `src/organizations/organization.types.ts`
- `src/organizations/postgres-organization.repository.ts`
- `src/organization-members/organization-member.repository.ts`
- `src/organization-members/organization-member.service.ts`
- `src/organization-members/organization-member.types.ts`
- `src/organization-members/postgres-organization-member.repository.ts`
- `src/container/organization.container.ts`
- `src/controllers/organization.controller.ts`
- `src/routes/organization.routes.ts`
- `src/validators/organization.validator.ts`
- `src/permissions/organization-permission.service.ts`
- `src/permissions/organization-permission.repository.ts`
- `src/permissions/postgres-organization-permission.repository.ts`
- `src/role-assignments/role-assignment.repository.ts`
- `src/role-assignments/postgres-role-assignment.repository.ts`
- `src/docs/openapi.ts`

**Tests**
- `tests/integration/organization.repository.test.ts`
- `tests/integration/organization.service.test.ts`
- `tests/integration/organization-member.repository.test.ts`
- `tests/integration/organization-member.service.test.ts`
- `tests/integration/organization-permission.repository.test.ts`
- `tests/integration/role-assignment.repository.test.ts`
- `tests/unit/organization.controller.test.ts`
- `tests/unit/organization.routes.test.ts`
- `tests/unit/organization.service.test.ts`
- `tests/unit/organization-member.service.test.ts`
- `tests/unit/permissions/organization-permission.service.test.ts`

**Dependencies**
- Organization membership
- `OrganizationPermissionService`
- Role assignments
- Project creation/listing
- Trusted-origin protection for state-changing routes
- OpenAPI schemas

**Verify**
- Owner/admin/member permission matrix
- Tenant isolation
- Route middleware order
- Write-origin tests
- Service and repository integration tests

### 4.4 Organization member directory

**Source files**
- `src/organization-members/organization-member.repository.ts`
- `src/organization-members/organization-member.service.ts`
- `src/organization-members/organization-member.types.ts`
- `src/organization-members/postgres-organization-member.repository.ts`
- `src/permissions/organization-permission.service.ts`
- `src/permissions/organization-permission.repository.ts`
- `src/permissions/postgres-organization-permission.repository.ts`
- `src/organizations/organization.repository.ts`
- `src/organizations/postgres-organization.repository.ts`
- `src/container/organization.container.ts`
- `src/controllers/organization.controller.ts`
- `src/routes/organization.routes.ts`
- `src/validators/organization.validator.ts`
- `src/docs/openapi.ts`

**Tests**
- `tests/unit/organization-member.service.test.ts`
- `tests/integration/organization-member.service.test.ts`
- `tests/integration/organization-member.repository.test.ts`
- `tests/unit/organization.controller.test.ts`
- `tests/unit/organization.routes.test.ts`
- `tests/unit/permissions/organization-permission.service.test.ts`
- `tests/integration/organization-permission.repository.test.ts`

**Dependencies**
- `OrganizationPermissionService`
- `organization.members.view`
- `organization.members.view_details`
- `organization.members.manage`
- Basic and extended response projections
- Organization membership status

**Approved privacy policy**
- Basic directory: `userId` and `displayName` only.
- Extended details: email, account status, membership status, assigned roles, and join date.
- `view`, `view_details`, and `manage` are independent permissions.
- Default grants:
  - Owner: all three.
  - Admin: `view` and `manage`, not `view_details`.
  - Ordinary member: `view` only.

**Implementation plan**
- Add a new forward-only migration 010 for the permission definitions and grants.
- Do not edit migrations 004 or 009.
- Inject `OrganizationPermissionService` into `OrganizationMemberService`.
- Add a dedicated basic member-directory repository projection.
- Require `organization.members.view` for directory listing.
- Require `organization.members.view_details` for extended member details.
- Keep `organization.members.manage` independent from read permissions.
- Update container wiring, route/API documentation, and tests.

**Verify**
- Basic directory never returns restricted fields.
- Extended details denied without `view_details`.
- Permission defaults match the approved policy.
- Controller/OpenAPI/tests match the actual response projection.
- Suspended requesters and outsiders cannot read directory data.
- Do not silently change whether suspended target memberships appear in the basic directory; that behavior requires an explicit policy decision.

**Current status:** Policy approved. Implementation not yet applied.

### 4.5 Roles and permissions

**Source files**
- `src/permissions/organization-permission.repository.ts`
- `src/permissions/organization-permission.service.ts`
- `src/permissions/postgres-organization-permission.repository.ts`
- `src/role-assignments/role-assignment.repository.ts`
- `src/role-assignments/postgres-role-assignment.repository.ts`
- `src/organizations/organization.repository.ts`
- `src/organization-members/organization-member.repository.ts`
- `src/project-members/project-member.repository.ts`
- `src/project-members/project-member.types.ts`
- `src/project-members/postgres-project-member.repository.ts`
- `src/container/organization.container.ts`
- `src/container/project.container.ts`
- `src/database/migrations/003_create_identity_and_project_foundation.sql`
- `src/database/migrations/004_create_role_and_permission_foundation.sql`
- `src/database/migrations/009_add_conversation_scope_and_permissions.sql`
- Future permission migrations, including planned migration 010

**Tests**
- `tests/unit/permissions/organization-permission.service.test.ts`
- `tests/unit/role-assignments/postgres-role-assignment.repository.test.ts`
- `tests/integration/organization-permission.repository.test.ts`
- `tests/integration/role-assignment.repository.test.ts`
- `tests/integration/organization-member.repository.test.ts`
- `tests/integration/project.service.test.ts`

**Dependencies**
- `roles`
- `permissions`
- `role_permissions`
- `organization_member_roles`
- `project_member_roles`
- Active organization/project memberships
- Scope of built-in and custom roles

**Verify**
- Built-in and custom role assignment
- Invalid membership/project scope rejected
- Assignment reports failure when no row was inserted
- Suspended memberships denied
- Wrong organization/project denied
- Permission definitions, role grants, and service enforcement agree

### 4.6 Project management

**Source files**
- `src/projects/project.repository.ts`
- `src/projects/project.service.ts`
- `src/projects/project.types.ts`
- `src/projects/postgres-project.repository.ts`
- `src/project-members/project-member.repository.ts`
- `src/project-members/project-member.types.ts`
- `src/project-members/postgres-project-member.repository.ts`
- `src/permissions/organization-permission.service.ts`
- `src/permissions/organization-permission.repository.ts`
- `src/permissions/postgres-organization-permission.repository.ts`
- `src/role-assignments/role-assignment.repository.ts`
- `src/role-assignments/postgres-role-assignment.repository.ts`
- `src/container/project.container.ts`
- `src/controllers/project.controller.ts`
- `src/routes/project.routes.ts`
- `src/validators/project.validator.ts`
- `src/docs/openapi.ts`

**Tests**
- `tests/unit/project.controller.test.ts`
- `tests/unit/project.routes.test.ts`
- `tests/unit/project.service.test.ts`
- `tests/integration/project.service.test.ts`
- `tests/integration/organization-permission.repository.test.ts`
- `tests/integration/role-assignment.repository.test.ts`

**Dependencies**
- Organization membership
- Project membership
- Canonical permission service
- `project_member_roles`
- Project visibility/list query
- Create/update/status permissions
- Trusted-origin middleware for state-changing routes

**Verify**
- Owner/admin/member/custom-role matrix
- Project visibility and tenant isolation
- Legacy and canonical authorization behavior cannot silently diverge
- Write-origin tests
- Unit and repository/service integration tests

### 4.7 Invitations and email

**Source files**
- `src/invitations/invitation.repository.ts`
- `src/invitations/invitation.service.ts`
- `src/invitations/invitation.types.ts`
- `src/invitations/postgres-invitation.repository.ts`
- `src/container/invitation.container.ts`
- `src/controllers/invitation.controller.ts`
- `src/routes/invitation.routes.ts`
- `src/validators/invitation.validator.ts`
- `src/email/development-email.service.ts`
- `src/email/email.service.ts`
- `src/container/email.container.ts`
- `src/organization-members/organization-member.repository.ts`
- `src/role-assignments/role-assignment.repository.ts`
- `src/database/transaction-manager.ts`

**Migrations**
- `src/database/migrations/005_create_invitation_foundation.sql`
- `src/database/migrations/006_enforce_pending_invitation_uniqueness.sql`
- `src/database/migrations/007_remove_redundant_invitation_indexes.sql`
- `src/database/migrations/008_track_invitation_delivery_attempts.sql`

**Tests**
- `tests/unit/invitation.controller.test.ts`
- `tests/unit/invitation.routes.test.ts`
- `tests/unit/invitation.service.test.ts`
- `tests/unit/postgres-invitation.repository.test.ts`
- `tests/integration/invitation.repository.test.ts`
- `tests/integration/invitation.service.test.ts`
- `tests/unit/development-email.service.test.ts`

**Dependencies**
- Organization membership and role assignment
- Email delivery attempt tracking
- Token hashing and rotation
- Advisory lock and row lock
- Accept/resend/revoke concurrency
- Trusted-origin middleware
- TransactionManager

**Verify**
- Concurrent acceptance and resend
- Stale token rejected
- Delivery failure/retry state
- Duplicate pending invitation behavior
- Role/membership rollback on acceptance failure
- Tenant isolation

### 4.8 Conversations and chat

**Source files**
- `src/conversations/conversation-access.service.ts`
- `src/conversations/conversation.repository.ts`
- `src/conversations/conversation.service.ts`
- `src/conversations/conversation.types.ts`
- `src/conversations/postgres-conversation.repository.ts`
- `src/agent/agent-chat.service.ts`
- `src/agent/agent-provider.ts`
- `src/agent/agent-provider.factory.ts`
- `src/services/agent.service.ts`
- `src/services/mock-agent.service.ts`
- `src/controllers/agent.controller.ts`
- `src/routes/agent.routes.ts`
- `src/container/agent.container.ts`
- `src/validators/agent.validator.ts`
- `src/permissions/organization-permission.service.ts`
- `src/database/transaction-manager.ts`

**Migrations**
- `src/database/migrations/001_create_conversations.sql`
- `src/database/migrations/002_optimize_conversation_message_lookup.sql`
- `src/database/migrations/009_add_conversation_scope_and_permissions.sql`

**Tests**
- `tests/unit/agent-chat.service.test.ts`
- `tests/unit/agent-provider.factory.test.ts`
- `tests/unit/agent.controller.test.ts`
- `tests/unit/agent.service.test.ts`
- `tests/unit/mock-agent.service.test.ts`
- `tests/unit/conversation-access.service.test.ts`
- `tests/unit/conversation.service.test.ts`
- `tests/integration/agent.routes.test.ts`
- `tests/integration/conversation.repository.test.ts`

**Dependencies**
- Personal/organization/project conversation scope
- Immutable ownership/scope fields
- Organization/project view and participate permissions
- AI provider
- Two transaction phases around provider call
- Audit/traceability

**Required behavior**
- New conversation requests specify scope: personal, organization, or project.
- Existing conversation scope and ownership come from the database, not client-supplied fields.
- Authorize and append user message in transaction one.
- Call AI provider outside transaction.
- Recheck participation permission and append assistant response in transaction two.
- If permission is revoked during generation, preserve the user message, do not save assistant response, and return 403.

**Verify**
- Scope isolation
- View vs participate distinction
- Permission-revocation race
- Legacy conversations remain archived
- Provider failure and transaction rollback

### 4.9 Approval management - planned

**Inspect**
- Module files not implemented; paths TBD.

**Dependencies**
- Versioned artifacts
- Approver permissions
- Approval policy satisfaction
- State machine and material-change reapproval
- Notifications and audit history
- Separation-of-duties policy

**Verify**
- State transitions
- Exact approved-version immutability
- Reject / request changes / resubmit
- Required approver policy and audit history

### 4.10 Risk and impact analysis - planned

**Inspect**
- Module files not implemented; paths TBD.

**Dependencies**
- Project scope and affected components/deliverables
- Likelihood, severity, confidence
- Evidence vs assumptions
- Mitigations and owners
- Approval policy and audit history

**Verify**
- Deterministic checks separated from AI assessment
- Risk state transitions
- Tenant access
- High-risk action gating and reassessment

### 4.11 Files and artifacts - planned

**Inspect**
- Module files not implemented; paths TBD.

**Dependencies**
- Storage provider
- Tenant ownership/scope
- Metadata and versioning
- Content validation
- Approval linkage
- Signed access and retention

**Verify**
- Access control
- Upload constraints
- Version/deletion lifecycle
- Storage failure recovery

### 4.12 Execution jobs and workers - planned

**Inspect**
- Module files not implemented; paths TBD.

**Dependencies**
- Queue/job state
- Idempotency and retries
- Cancellation
- Authorization at execution time
- Approval gates
- Audit and observability

**Verify**
- Duplicate delivery
- Retry exhaustion
- Cancellation
- Permission revoked before execution
- Recovery after worker failure

### 4.13 Deployment and release - planned

**Inspect**
- Module files not implemented; paths TBD.

**Dependencies**
- Release approval
- Environment configuration and secrets
- Migration ordering
- Rollback
- Health/readiness
- Audit

**Verify**
- Deployment and rollback rehearsal
- Migration smoke test
- Health checks
- Release gate policy

## 5. Repository file index

This index is a navigation aid. Paths below were present in the supplied source inventory. It does not certify that every file has been reviewed.

### 5.1 Core application

- `src/app.ts`
- `src/server.ts`
- `src/server-startup.ts`
- `src/server-lifecycle.ts`

### 5.2 Agent and AI provider

- `src/agent/agent-chat.service.ts`
- `src/agent/agent-provider.factory.ts`
- `src/agent/agent-provider.ts`
- `src/services/agent.service.ts`
- `src/services/mock-agent.service.ts`
- `src/controllers/agent.controller.ts`
- `src/routes/agent.routes.ts`
- `src/container/agent.container.ts`
- `src/validators/agent.validator.ts`

### 5.3 Authentication, users, and sessions

- `src/auth/auth.service.ts`
- `src/auth/email-verification.service.ts`
- `src/auth/password.service.ts`
- `src/auth/registration.service.ts`
- `src/auth/session-cookie.ts`
- `src/auth/token.service.ts`
- `src/auth-tokens/auth-token.repository.ts`
- `src/auth-tokens/auth-token.types.ts`
- `src/auth-tokens/postgres-auth-token.repository.ts`
- `src/sessions/postgres-session.repository.ts`
- `src/sessions/session.repository.ts`
- `src/sessions/session.types.ts`
- `src/users/postgres-user.repository.ts`
- `src/users/user.repository.ts`
- `src/users/user.service.ts`
- `src/users/user.types.ts`
- `src/controllers/auth.controller.ts`
- `src/routes/auth.routes.ts`
- `src/container/auth.container.ts`
- `src/container/email.container.ts`
- `src/middleware/auth.middleware.ts`
- `src/validators/auth.validator.ts`

### 5.4 Organizations, members, permissions, and roles

- `src/organizations/organization.repository.ts`
- `src/organizations/organization.service.ts`
- `src/organizations/organization.types.ts`
- `src/organizations/postgres-organization.repository.ts`
- `src/organization-members/organization-member.repository.ts`
- `src/organization-members/organization-member.service.ts`
- `src/organization-members/organization-member.types.ts`
- `src/organization-members/postgres-organization-member.repository.ts`
- `src/permissions/organization-permission.repository.ts`
- `src/permissions/organization-permission.service.ts`
- `src/permissions/postgres-organization-permission.repository.ts`
- `src/role-assignments/postgres-role-assignment.repository.ts`
- `src/role-assignments/role-assignment.repository.ts`
- `src/container/organization.container.ts`
- `src/controllers/organization.controller.ts`
- `src/routes/organization.routes.ts`
- `src/validators/organization.validator.ts`

### 5.5 Projects and project members

- `src/projects/postgres-project.repository.ts`
- `src/projects/project.repository.ts`
- `src/projects/project.service.ts`
- `src/projects/project.types.ts`
- `src/project-members/postgres-project-member.repository.ts`
- `src/project-members/project-member.repository.ts`
- `src/project-members/project-member.types.ts`
- `src/container/project.container.ts`
- `src/controllers/project.controller.ts`
- `src/routes/project.routes.ts`
- `src/validators/project.validator.ts`

### 5.6 Invitations and email

- `src/invitations/invitation.repository.ts`
- `src/invitations/invitation.service.ts`
- `src/invitations/invitation.types.ts`
- `src/invitations/postgres-invitation.repository.ts`
- `src/container/invitation.container.ts`
- `src/controllers/invitation.controller.ts`
- `src/routes/invitation.routes.ts`
- `src/validators/invitation.validator.ts`
- `src/email/development-email.service.ts`
- `src/email/email.service.ts`

### 5.7 Conversations

- `src/conversations/conversation-access.service.ts`
- `src/conversations/conversation.repository.ts`
- `src/conversations/conversation.service.ts`
- `src/conversations/conversation.types.ts`
- `src/conversations/postgres-conversation.repository.ts`

### 5.8 Database and configuration

- `src/config/database.ts`
- `src/config/env.ts`
- `src/config/migration-test-database.ts`
- `src/config/test-database.ts`
- `src/database/migrate-status.ts`
- `src/database/migrate.ts`
- `src/database/migration.runner.ts`
- `src/database/transaction-manager.ts`

### 5.9 Cross-cutting

- `src/docs/openapi.ts`
- `src/errors/app.error.ts`
- `src/middleware/error.middleware.ts`
- `src/middleware/rate-limit.middleware.ts`
- `src/middleware/request-id.middleware.ts`
- `src/middleware/request-logger.middleware.ts`
- `src/middleware/trusted-origin.middleware.ts`
- `src/middleware/validate.middleware.ts`
- `src/types/express.d.ts`
- `src/utils/logger.ts`

## 6. Test repository index

All paths below were present in the supplied test inventory. They are marked TEST PATH VERIFIED, not comprehensively behavior-reviewed.

### 6.1 Shared helpers

- `tests/helpers/database-setup.ts`

### 6.2 Integration tests

**Agent and health**
- `tests/integration/agent.routes.test.ts`
- `tests/integration/health.routes.test.ts`

**Authentication, identity, and sessions**
- `tests/integration/auth-token.repository.test.ts`
- `tests/integration/auth.service.test.ts`
- `tests/integration/email-verification.service.test.ts`
- `tests/integration/session.repository.test.ts`
- `tests/integration/user.repository.test.ts`
- `tests/integration/user.service.test.ts`

**Conversations**
- `tests/integration/conversation.repository.test.ts`

**Invitations**
- `tests/integration/invitation.repository.test.ts`
- `tests/integration/invitation.service.test.ts`

**Migrations**
- `tests/integration/migration.runner.test.ts`

**Organizations and permissions**
- `tests/integration/organization-member.repository.test.ts`
- `tests/integration/organization-member.service.test.ts`
- `tests/integration/organization-permission.repository.test.ts`
- `tests/integration/organization.repository.test.ts`
- `tests/integration/organization.service.test.ts`

**Projects and roles**
- `tests/integration/project.service.test.ts`
- `tests/integration/role-assignment.repository.test.ts`

**Security**
- `tests/integration/security.test.ts`

### 6.3 Unit tests

**Agent**
- `tests/unit/agent-chat.service.test.ts`
- `tests/unit/agent-provider.factory.test.ts`
- `tests/unit/agent.controller.test.ts`
- `tests/unit/agent.service.test.ts`
- `tests/unit/mock-agent.service.test.ts`

**Application and infrastructure**
- `tests/unit/app.test.ts`
- `tests/unit/database.test.ts`
- `tests/unit/env.test.ts`
- `tests/unit/error.middleware.test.ts`
- `tests/unit/logger.test.ts`
- `tests/unit/server-lifecycle.test.ts`
- `tests/unit/server-startup.test.ts`
- `tests/unit/transaction-manager.test.ts`

**Authentication and users**
- `tests/unit/auth.controller.test.ts`
- `tests/unit/auth.middleware.test.ts`
- `tests/unit/auth.routes.test.ts`
- `tests/unit/auth.service.test.ts`
- `tests/unit/auth.validator.test.ts`
- `tests/unit/password.service.test.ts`
- `tests/unit/registration.service.test.ts`
- `tests/unit/session-cookie.test.ts`
- `tests/unit/token.service.test.ts`
- `tests/unit/user.service.test.ts`

**Conversations**
- `tests/unit/conversation-access.service.test.ts`
- `tests/unit/conversation.service.test.ts`

**Email**
- `tests/unit/development-email.service.test.ts`
- `tests/unit/email-verification.service.test.ts`

**Invitations**
- `tests/unit/invitation.controller.test.ts`
- `tests/unit/invitation.routes.test.ts`
- `tests/unit/invitation.service.test.ts`
- `tests/unit/postgres-invitation.repository.test.ts`

**Organizations and members**
- `tests/unit/organization-member.service.test.ts`
- `tests/unit/organization.controller.test.ts`
- `tests/unit/organization.routes.test.ts`
- `tests/unit/organization.service.test.ts`

**Permissions and roles**
- `tests/unit/permissions/organization-permission.service.test.ts`
- `tests/unit/role-assignments/postgres-role-assignment.repository.test.ts`

**Projects**
- `tests/unit/project.controller.test.ts`
- `tests/unit/project.routes.test.ts`
- `tests/unit/project.service.test.ts`

**Middleware and request handling**
- `tests/unit/rate-limit.middleware.test.ts`
- `tests/unit/request-logging.middleware.test.ts`
- `tests/unit/trusted-origin.middleware.test.ts`
- `tests/unit/validate.middleware.test.ts`

### 6.4 Migration test fixtures

These SQL files are test fixtures, not production migrations. Do not treat them as part of the production migration sequence.

**Baseline migration fixtures**
- `tests/fixtures/baseline-migrations/001_create_conversations.sql`
- `tests/fixtures/baseline-migrations/002_optimize_conversation_message_lookup.sql`

**Checksum migration fixtures**
- `tests/fixtures/checksum-migrations/initial/001_checksum_test.sql`
- `tests/fixtures/checksum-migrations/initial/001_create_conversations.sql`
- `tests/fixtures/checksum-migrations/initial/002_optimize_conversation_message_lookup.sql`
- `tests/fixtures/checksum-migrations/modified/001_checksum_test.sql`
- `tests/fixtures/checksum-migrations/modified/001_create_conversations.sql`
- `tests/fixtures/checksum-migrations/modified/002_optimize_conversation_message_lookup.sql`

**Concurrent migration fixtures**
- `tests/fixtures/concurrent-migrations/001_concurrency_test.sql`
- `tests/fixtures/concurrent-migrations/001_create_conversations.sql`
- `tests/fixtures/concurrent-migrations/002_optimize_conversation_message_lookup.sql`

**Deleted migration fixtures**
- `tests/fixtures/deleted-migrations/initial/001_create_conversations.sql`
- `tests/fixtures/deleted-migrations/initial/001_deleted_test.sql`
- `tests/fixtures/deleted-migrations/initial/002_optimize_conversation_message_lookup.sql`
- `tests/fixtures/deleted-migrations/remaining/001_create_conversations.sql`
- `tests/fixtures/deleted-migrations/remaining/002_optimize_conversation_message_lookup.sql`

**General migration fixtures**
- `tests/fixtures/migrations/001_create_conversations.sql`
- `tests/fixtures/migrations/001_intentional_failure.sql`
- `tests/fixtures/migrations/002_optimize_conversation_message_lookup.sql`

**Role migration fixtures**
- `tests/fixtures/role-migrations/001_create_conversations.sql`
- `tests/fixtures/role-migrations/002_optimize_conversation_message_lookup.sql`
- `tests/fixtures/role-migrations/003_create_identity_and_project_foundation.sql`
- `tests/fixtures/role-migrations/004_create_role_and_permission_foundation.sql`
- `tests/fixtures/role-migrations/baseline/001_create_conversations.sql`
- `tests/fixtures/role-migrations/baseline/002_optimize_conversation_message_lookup.sql`
- `tests/fixtures/role-migrations/baseline/003_create_identity_and_project_foundation.sql`

## 7. Production migration index

Production migrations known in this baseline:

| Migration | Exact path | Purpose |
|---|---|---|
| 001 | `src/database/migrations/001_create_conversations.sql` | Initial conversation storage |
| 002 | `src/database/migrations/002_optimize_conversation_message_lookup.sql` | Conversation message lookup optimization |
| 003 | `src/database/migrations/003_create_identity_and_project_foundation.sql` | Identity, organization, project, and membership foundation |
| 004 | `src/database/migrations/004_create_role_and_permission_foundation.sql` | Roles, permissions, role assignments, and legacy-role backfill |
| 005 | `src/database/migrations/005_create_invitation_foundation.sql` | Invitation foundation |
| 006 | `src/database/migrations/006_enforce_pending_invitation_uniqueness.sql` | Pending invitation uniqueness |
| 007 | `src/database/migrations/007_remove_redundant_invitation_indexes.sql` | Remove redundant invitation indexes |
| 008 | `src/database/migrations/008_track_invitation_delivery_attempts.sql` | Invitation email delivery attempt tracking |
| 009 | `src/database/migrations/009_add_conversation_scope_and_permissions.sql` | Conversation scope, immutable ownership fields, scoped conversation permissions |
| 010 | Planned; path not created yet | Organization member directory privacy permissions and grants |

**Rule:** Never edit an applied migration. Add a new migration and test the upgrade path.

## 8. Current audit and decision register

| ID | Finding / decision | Status | Next action |
|---|---|---|---|
| AUD-ORG-01 | Member directory returns full details to any active organization member, conflicting with approved privacy policy. | Confirmed; not yet remediated | Implement basic projection and details permission. |
| POL-ORG-01 | Directory permissions: view, view_details, manage independent; owner all; admin view+manage; member view only. | Approved | Add migration 010 and update service/container/API/tests. Do not edit migrations 004/009. |
| AUD-PROJ-01 | Project discovery uses legacy roles/membership instead of canonical role/permission tables. | Confirmed inconsistency; exploitability not established | Design and test canonical permission-based visibility. |
| AUD-ROLE-01 | Role assignment repository supports built-in roles only; custom role assignment is unsupported. | Confirmed limitation | Design custom-role scope validation and assignment semantics. |
| AUD-ROLE-02 | Role assignment INSERT...SELECT may insert zero rows while role-existence check still succeeds. | Confirmed design concern; impact to validate | Test invalid/suspended membership, wrong org/project, duplicate and custom role. |
| AUD-ORIGIN-01 | Inspected project mutations and organization PATCH lack trusted-origin middleware. | Confirmed route-wiring gap | Assess cookie-auth threat model; protect applicable mutations and add origin tests. |
| AUD-PERM-01 | Migration 004 grants `project.create` to ordinary organization members. | Existing policy; not classified as defect | Preserve unless product policy changes; ensure enforcement matches. |
| AUD-CONV-01 | Migration 009 adds scoped conversations and permissions; existing 255 conversations became legacy/archived. | Applied and verified | Preserve immutable scope fields and explicit create scope. |

### Audit scope and confidence

The audit findings above are based on the specific source files and tests supplied and reviewed during project work. This is not a claim that every file in Sections 5 and 6 has undergone a complete systematic code review. Test results are recorded separately in the project conversation and must be refreshed when relevant code changes.

## 9. Change-impact record template

Copy this block into the relevant change notes or update the audit register:

```text
CHANGE ID / DATE:
FEATURE / USE CASE:
BEHAVIOR BEING CHANGED:

FILES INSPECTED:
- [ ]

CONTRACTS CHANGED:
- API request/response:
- Service interface:
- Repository interface:
- Permission key:
- Database schema:
- Event/job:

CROSS-MODULE DEPENDENCIES:
- [ ]

SECURITY / GOVERNANCE:
- Actor permission:
- Tenant scope:
- Trusted origin:
- Approval/risk/audit impact:

MIGRATION:
- None / migration number and purpose:

TESTS RUN:
- Command:
- Result:

NOT CHECKED / ASSUMPTIONS:
- [ ]

MAP UPDATES:
- [ ]
```

## 10. Maintenance rules

- Update the feature row when a file is added, moved, renamed, or becomes a dependency.
- Add shared components to Section 3 when more than one module depends on them.
- Update permission keys, role grants, and test expectations together.
- When an audit finding is fixed, mark it resolved and record the implementation commit or test evidence; do not erase its history.
- Keep exact test commands and results. Distinguish unit tests, mocked service tests, repository integration tests, and end-to-end behavior.
- A focused feature change does not automatically require a full repository scan.
- Perform broader architecture consistency reviews at deliberate milestones, not on every small change.
- If code contradicts this map, verify the code and update the map; the map is an index, not the source of truth.
- A path being listed does not mean its implementation has been inspected.
- Keep planned modules clearly separated from implemented modules.
- Keep test fixtures separate from production migrations.
- Never overwrite a user's uncommitted application work as part of documentation maintenance.

---

**End of architecture map v1.1.**

Next maintenance target: implement the approved organization member-directory privacy policy, beginning with migration 010 and the member repository/service dependency chain.
