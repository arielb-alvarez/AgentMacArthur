import {
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

const ALGORITHM = "scrypt";
const VERSION = "v1";

const COST_FACTOR = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

const MAX_MEMORY = 64 * 1024 * 1024;

const HASH_PATTERN =
  /^scrypt\$v1\$16384\$8\$1\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{86})$/;

interface ParsedPasswordHash {
  salt: Buffer;
  derivedKey: Buffer;
}

const deriveKey = (
  password: string,
  salt: Buffer
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: COST_FACTOR,
        r: BLOCK_SIZE,
        p: PARALLELIZATION,
        maxmem: MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      }
    );
  });
};

const parsePasswordHash = (
  encodedHash: string
): ParsedPasswordHash | undefined => {
  const match = HASH_PATTERN.exec(encodedHash);

  if (!match) {
    return undefined;
  }

  const salt = Buffer.from(match[1], "base64url");
  const derivedKey = Buffer.from(match[2], "base64url");

  if (
    salt.length !== SALT_LENGTH ||
    derivedKey.length !== KEY_LENGTH
  ) {
    return undefined;
  }

  return {
    salt,
    derivedKey,
  };
};

export class PasswordService {
  async hashPassword(password: string): Promise<string> {
    if (password.length === 0) {
      throw new TypeError("Password must not be empty.");
    }

    const salt = randomBytes(SALT_LENGTH);

    const derivedKey = await deriveKey(password, salt);

    return [
      ALGORITHM,
      VERSION,
      COST_FACTOR,
      BLOCK_SIZE,
      PARALLELIZATION,
      salt.toString("base64url"),
      derivedKey.toString("base64url"),
    ].join("$");
  }

  async verifyPassword(
    password: string,
    encodedHash: string
  ): Promise<boolean> {
    if (password.length === 0) {
      return false;
    }

    const parsedHash = parsePasswordHash(encodedHash);

    if (!parsedHash) {
      return false;
    }

    const derivedKey = await deriveKey(
      password,
      parsedHash.salt
    );

    return timingSafeEqual(
      derivedKey,
      parsedHash.derivedKey
    );
  }
}
