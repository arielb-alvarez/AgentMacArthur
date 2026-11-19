export type ManagedRoleScope = "organization" | "project";

export interface ManagedRole {
  id: string;
  organizationId: string;
  scope: ManagedRoleScope;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PermissionDefinition {
  id: string;
  scope: ManagedRoleScope;
  key: string;
  description: string;
  createdAt: Date;
}

export interface CreateCustomRoleInput {
  organizationId: string;
  scope: ManagedRoleScope;
  key: string;
  name: string;
  description?: string | null;
}

export interface UpdateCustomRoleInput {
  organizationId: string;
  roleId: string;
  name: string;
  description?: string | null;
}

export interface ReplaceRolePermissionsInput {
  organizationId: string;
  roleId: string;
  permissionIds: string[];
}