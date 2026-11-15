import { describe, expect, it } from "vitest";

import { TokenService } from "../../src/auth/token.service.js";

describe("TokenService", () => {
  const service = new TokenService();

  it("should generate a raw token", () => {
    const result = service.generate();

    expect(result.rawToken).toBeTruthy();
    expect(result.rawToken).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("should generate a 64-character hexadecimal hash", () => {
    const result = service.generate();

    expect(result.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should generate unique tokens", () => {
    const first = service.generate();
    const second = service.generate();

    expect(first.rawToken).not.toBe(second.rawToken);
    expect(first.tokenHash).not.toBe(second.tokenHash);
  });

  it("should generate a hash that can be reproduced", () => {
    const result = service.generate();

    expect(service.hash(result.rawToken)).toBe(result.tokenHash);
  });

  it("should generate different hashes for different tokens", () => {
    const firstHash = service.hash("first-token");
    const secondHash = service.hash("second-token");

    expect(firstHash).not.toBe(secondHash);
  });

  it("should reject an empty token", () => {
    expect(() => service.hash("")).toThrow(
      "Authentication token cannot be empty."
    );
  });
});
