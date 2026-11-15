
import { describe, it, expect } from "vitest";
import request from "supertest";

import { createApp } from "../../src/app.js";

describe("Application Factory", () => {
  it("should create an Express application instance", () => {
    const app = createApp();

    expect(app).toBeDefined();
    expect(typeof app).toBe("function");
    expect(typeof app.listen).toBe("function");
  });

  it("should create independent application instances", () => {
    const firstApp = createApp();
    const secondApp = createApp();

    expect(firstApp).not.toBe(secondApp);
  });

  it("should configure application middleware and routes", async () => {
    const app = createApp();

    const response = await request(app).get("/health/live");

    expect(response.status).toBe(200);
  });
});
