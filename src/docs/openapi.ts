import swaggerJsdoc from "swagger-jsdoc";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const routeFileExtension = import.meta.url.endsWith(".ts") ? "ts" : "js";

const routeDocumentationPattern = join(
  currentDirectory,
  `../routes/*.${routeFileExtension}`
).replace(/\\/g, "/");

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",

    info: {
      title: "AgentMacArthur API",
      version: "1.0.0",
      description:
        "API documentation for the AgentMacArthur AI agent backend.",
    },

    servers: [
      {
        url: "http://localhost:3000",
        description: "Local development server",
      },
    ],

    tags: [
      {
        name: "Health",
        description: "Application health and readiness checks",
      },
      {
        name: "Agent",
        description: "AI agent interaction endpoints",
      },
      {
        name: "Authentication",
        description:
          "Account registration, email verification, login, sessions, and authentication.",
      },
      {
        name: "Projects",
        description:
          "Project creation, discovery, access, and management.",
      },
      {
        name: "Organizations",
        description:
          "Organization discovery, access, and management.",
      },
      {
        name: "Invitations",
        description:
          "Organization invitations, email delivery, resending, revocation, and acceptance.",
      },
    ],

    components: {
      schemas: {
        ChatRequest: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["message", "conversationId"],
              properties: {
                message: {
                  type: "string",
                  minLength: 1,
                  maxLength: 10000,
                  description: "Message sent to the AI agent.",
                  example: "Continue working on the project.",
                },
                conversationId: {
                  type: "string",
                  format: "uuid",
                  description: "Existing conversation to continue.",
                },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["message", "scope"],
              properties: {
                message: {
                  type: "string",
                  minLength: 1,
                  maxLength: 10000,
                },
                scope: {
                  type: "string",
                  enum: ["personal"],
                  description: "Creates a personal conversation.",
                },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["message", "scope", "organizationId"],
              properties: {
                message: {
                  type: "string",
                  minLength: 1,
                  maxLength: 10000,
                },
                scope: {
                  type: "string",
                  enum: ["organization"],
                },
                organizationId: {
                  type: "string",
                  format: "uuid",
                },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: [
                "message",
                "scope",
                "organizationId",
                "projectId",
              ],
              properties: {
                message: {
                  type: "string",
                  minLength: 1,
                  maxLength: 10000,
                },
                scope: {
                  type: "string",
                  enum: ["project"],
                },
                organizationId: {
                  type: "string",
                  format: "uuid",
                },
                projectId: {
                  type: "string",
                  format: "uuid",
                },
              },
            },
          ],
          description:
            "Provide exactly one request format: continue an existing conversation or create a personal, organization, or project conversation.",
        },


        ChatResponse: {
          type: "object",
          required: [
            "success",
            "agent",
            "conversationId",
            "response",
          ],
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            agent: {
              type: "string",
              example: "AgentMacArthur",
            },
            conversationId: {
              type: "string",
              format: "uuid",
            },
            response: {
              type: "string",
            },
          },
        },

        ValidationError: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            code: {
              type: "string",
              example: "VALIDATION_ERROR",
            },
            message: {
              type: "string",
              example: "Validation failed",
            },
            errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: {
                    type: "string",
                    example: "message",
                  },
                  message: {
                    type: "string",
                    example: "Message cannot be empty.",
                  },
                },
              },
            },
          },
        },

        ErrorResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
            },
          },
        },

        RateLimitError: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            error: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  example: "CHAT_RATE_LIMIT_EXCEEDED",
                },
                message: {
                  type: "string",
                },
              },
            },
          },
        },

        HealthResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
            },
            application: {
              type: "string",
              example: "AgentMacArthur",
            },
            status: {
              type: "string",
              example: "alive",
            },
            timestamp: {
              type: "string",
              format: "date-time",
            },
          },
        },

        ReadinessResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
            },
            application: {
              type: "string",
              example: "AgentMacArthur",
            },
            status: {
              type: "string",
              enum: ["ready", "not_ready"],
            },
            environment: {
              type: "string",
            },
            checks: {
              type: "object",
              properties: {
                database: {
                  type: "string",
                  enum: ["healthy", "unhealthy"],
                },
              },
            },
            timestamp: {
              type: "string",
              format: "date-time",
            },
          },
        },

        RegisterRequest: {
          type: "object",
          additionalProperties: false,
          required: ["email", "password", "displayName"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "user@example.com",
            },
            password: {
              type: "string",
              minLength: 8,
              maxLength: 128,
              example: "StrongPassword123!",
            },
            displayName: {
              type: "string",
              minLength: 2,
              maxLength: 100,
              example: "John Doe",
            },
          },
        },

        VerifyEmailRequest: {
          type: "object",
          additionalProperties: false,
          required: ["token"],
          properties: {
            token: {
              type: "string",
              description: "Raw email verification token.",
            },
          },
        },

        CreateProjectRequest: {
          type: "object",
          additionalProperties: false,
          required: ["organizationId", "name"],
          properties: {
            organizationId: {
              type: "string",
              format: "uuid",
            },
            name: {
              type: "string",
              minLength: 1,
              maxLength: 150,
            },
            description: {
              type: "string",
              maxLength: 10000,
              nullable: true,
            },
          },
        },

        UpdateProjectRequest: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 150,
            },
            description: {
              type: "string",
              maxLength: 10000,
              nullable: true,
            },
          },
        },

        UpdateOrganizationRequest: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 150,
              example: "My Development Team",
            },
          },
        },

        UpdateProjectStatusRequest: {
          type: "object",
          additionalProperties: false,
          required: ["status"],
          properties: {
            status: {
              type: "string",
              enum: [
                "draft",
                "active",
                "on_hold",
                "completed",
                "archived",
              ],
            },
          },
        },

        Invitation: {
          type: "object",
          required: [
            "id",
            "organizationId",
            "projectId",
            "email",
            "roleId",
            "roleKey",
            "roleName",
            "invitedBy",
            "acceptedBy",
            "status",
            "expiresAt",
            "acceptedAt",
            "createdAt",
            "emailDeliveryStatus",
            "emailDeliveryAttempts",
            "emailLastAttemptAt",
            "emailSentAt",
          ],
          properties: {
            id: {
              type: "string",
              format: "uuid",
            },
            organizationId: {
              type: "string",
              format: "uuid",
            },
            projectId: {
              type: "string",
              format: "uuid",
              nullable: true,
              description: "Null for organization-level invitations.",
            },
            email: {
              type: "string",
              format: "email",
            },
            roleId: {
              type: "string",
              format: "uuid",
            },
            roleKey: {
              type: "string",
              example: "member",
            },
            roleName: {
              type: "string",
              example: "Member",
            },
            invitedBy: {
              type: "string",
              format: "uuid",
            },
            acceptedBy: {
              type: "string",
              format: "uuid",
              nullable: true,
            },
            status: {
              type: "string",
              enum: ["pending", "accepted", "revoked", "expired"],
            },
            expiresAt: {
              type: "string",
              format: "date-time",
            },
            acceptedAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
            emailDeliveryStatus: {
              type: "string",
              enum: ["pending", "sent", "failed", "unknown"],
            },
            emailDeliveryAttempts: {
              type: "integer",
              minimum: 0,
            },
            emailLastAttemptAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            emailSentAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
          },
        },

        CreateInvitationRequest: {
          type: "object",
          additionalProperties: false,
          required: ["email"],
          properties: {
            email: {
              type: "string",
              format: "email",
              maxLength: 254,
              example: "newmember@example.com",
            },
            roleKey: {
              type: "string",
              enum: ["admin", "member"],
              default: "member",
              description:
                "Organization role assigned when the invitation is accepted. Defaults to member.",
            },
          },
        },

        AcceptInvitationRequest: {
          type: "object",
          additionalProperties: false,
          required: ["token"],
          properties: {
            token: {
              type: "string",
              minLength: 1,
              maxLength: 256,
              description: "Raw invitation token received through email.",
            },
          },
        },

        InvitationActionResponse: {
          type: "object",
          required: ["success", "message", "invitation"],
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
            },
            invitation: {
              $ref: "#/components/schemas/Invitation",
            },
          },
        },

        InvitationListResponse: {
          type: "object",
          required: ["success", "invitations"],
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            invitations: {
              type: "array",
              items: {
                $ref: "#/components/schemas/Invitation",
              },
            },
          },
        },
      },

      securitySchemes: {
        SessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "agentmacarthur_session",
          description: "HttpOnly authentication session cookie.",
        },
      },
    },
  },

  apis: [routeDocumentationPattern],
};

export const openApiSpecification = swaggerJsdoc(options);
