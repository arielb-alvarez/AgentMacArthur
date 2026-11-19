import type { UserStatus } from "../users/user.types.js";

export type OrganizationMemberRole =
  | "owner"
  | "admin"
  | "member";

export type OrganizationMemberStatus =
  | "active"
  | "suspended";

export interface OrganizationMember {
  organizationId: string;
  userId: string;
  role: OrganizationMemberRole;
  status: OrganizationMemberStatus;
  joinedAt: Date;
}

export interface CreateOrganizationMemberInput {
  organizationId: string;
  userId: string;
  role: OrganizationMemberRole;
  status: OrganizationMemberStatus;
}

export interface OrganizationMemberDirectoryEntry {
  userId: string;
  displayName: string;
}

export interface OrganizationMemberAssignedRole {
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export interface OrganizationMemberDetails {
  organizationId: string;
  userId: string;
  email: string;
  displayName: string;
  userStatus: UserStatus;
  status: OrganizationMemberStatus;
  roles: OrganizationMemberAssignedRole[];
  joinedAt: Date;
}