import { createHash, randomBytes } from "node:crypto";

export interface GeneratedAuthToken {
  rawToken: string;
  tokenHash: string;
}

export class TokenService {
  generate(): GeneratedAuthToken {
    const rawToken = randomBytes(32).toString("base64url");

    return {
      rawToken,
      tokenHash: this.hash(rawToken),
    };
  }

  hash(rawToken: string): string {
    if (!rawToken) {
      throw new Error("Authentication token cannot be empty.");
    }

    return createHash("sha256")
      .update(rawToken, "utf8")
      .digest("hex");
  }
}
