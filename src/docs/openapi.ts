import swaggerJsdoc from "swagger-jsdoc";

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
    ],

    components: {
      schemas: {
        ChatRequest: {
          type: "object",
          additionalProperties: false,
          required: ["message"],
          properties: {
            message: {
              type: "string",
              minLength: 1,
              maxLength: 10000,
              description: "Message sent to the AI agent.",
              example: "Hello AgentMacArthur",
            },
            conversationId: {
              type: "string",
              format: "uuid",
              description:
                "Existing conversation ID. Omit to create a new conversation.",
            },
          },
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

  apis: ["./src/routes/*.ts"],
};

export const openApiSpecification = swaggerJsdoc(options);
