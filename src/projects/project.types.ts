export type ProjectStatus =
  | "draft"
  | "active"
  | "on_hold"
  | "completed"
  | "archived";

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectInput {
  organizationId: string;
  name: string;
  description?: string | null;
  createdBy: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
}

export interface UpdateProjectStatusInput {
  status: ProjectStatus;
}