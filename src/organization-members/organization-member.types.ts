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
