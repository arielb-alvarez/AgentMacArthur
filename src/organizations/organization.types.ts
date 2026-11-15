export type OrganizationType = "personal" | "team";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  type: OrganizationType;
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  type: OrganizationType;
  ownerUserId: string;
}
