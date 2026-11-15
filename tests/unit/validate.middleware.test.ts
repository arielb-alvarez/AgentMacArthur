import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";

import { validate } from "../../src/middleware/validate.middleware.js";

describe("Validation Middleware", () => {
  it("should validate and transform request body", async () => {
    const app = express();
    app.use(express.json());

    app.post(
      "/test",
      validate(
        z.object({
          name: z.string().trim(),
        })
      ),
      (req, res) => {
        res.json(req.body);
      }
    );

    const response = await request(app)
      .post("/test")
      .send({ name: "  Ariel  " });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Ariel");
  });

  it("should validate and transform route parameters", async () => {
    const app = express();

    app.get(
      "/items/:id",
      validate(
        z.object({
          id: z.coerce.number().int().positive(),
        }),
        "params"
      ),
      (_req, res) => {
        res.json(res.locals.validatedRequest.params);
      }
    );

    const response = await request(app).get("/items/42");

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(42);
  });

  it("should validate and transform query parameters", async () => {
    const app = express();

    app.get(
      "/items",
      validate(
        z.object({
          page: z.coerce.number().int().positive(),
        }),
        "query"
      ),
      (_req, res) => {
        res.json(res.locals.validatedRequest.query);
      }
    );

    const response = await request(app).get("/items?page=3");

    expect(response.status).toBe(200);
    expect(response.body.page).toBe(3);
  });

  it("should return a consistent validation error response", async () => {
    const app = express();
    app.use(express.json());

    app.post(
      "/test",
      validate(
        z.object({
          name: z.string().min(1),
        })
      ),
      (_req, res) => {
        res.json({ success: true });
      }
    );

    const response = await request(app)
      .post("/test")
      .send({ name: "" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
    });

    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "name",
        }),
      ])
    );
  });
});
