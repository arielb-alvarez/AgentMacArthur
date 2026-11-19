export type ProjectMemberRole =
  | "project_owner"
  | "client"
  | "stakeholder"
  | "project_manager"
  | "technical_lead"
  | "developer"
  | "qa_engineer"
  | "viewer";

export type ProjectMemberStatus =
  | "active"
  | "suspended";

export interface ProjectMember {
  projectId: string;
  organizationId: string;
  userId: string;
  role: ProjectMemberRole;
  status: ProjectMemberStatus;
  joinedAt: Date;
}

export interface CreateProjectMemberInput {
  projectId: string;
  organizationId: string;
  userId: string;
  role: ProjectMemberRole;
  status?: ProjectMemberStatus;
}