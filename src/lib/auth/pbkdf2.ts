// ============================================================================
// PBKDF2-SHA256 password hashing (Web Crypto API)
// ============================================================================

const ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256 bits

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes.buffer;
}

function randomSalt(length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return hex(bytes.buffer);
}

export async function hashPassword(password: string): Promise<{
  hash: string;
  salt: string;
}> {
  const salt = randomSalt();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: fromHex(salt),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_LENGTH * 8
  );
  return { hash: hex(hash), salt };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  salt: string
): Promise<boolean> {
  try {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const hash = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: fromHex(salt),
        iterations: ITERATIONS,
        hash: "SHA-256",
      },
      keyMaterial,
      KEY_LENGTH * 8
    );
    return hex(hash) === storedHash;
  } catch {
    return false;
  }
}
