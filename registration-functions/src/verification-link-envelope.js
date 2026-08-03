import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes as secureRandomBytes,
} from "node:crypto";
import { RegistrationGateError, requiredText } from "./registration-contract.js";

const ENVELOPE_VERSION = 1;
const ENVELOPE_ALGORITHM = "A256GCM";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;

function encryptionKey(hmacKey) {
  const source = requiredText(hmacKey, "HMAC_KEY_REQUIRED", 4_096);
  if (Buffer.byteLength(source, "utf8") < KEY_BYTES) {
    throw new RegistrationGateError("HMAC_KEY_TOO_SHORT");
  }
  return createHmac("sha256", source)
    .update("cleanzi-verification-link-envelope-v1", "utf8")
    .digest();
}

function associatedData(operationId) {
  return Buffer.from(
    requiredText(operationId, "INVALID_OPERATION_ID", 160),
    "utf8",
  );
}

function encodedBytes(value, code, expectedLength = null) {
  const encoded = requiredText(value, code, 8_192);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new RegistrationGateError(code);
  }
  let bytes;
  try {
    bytes = Buffer.from(encoded, "base64url");
  } catch {
    throw new RegistrationGateError(code);
  }
  if (!bytes.length || (expectedLength !== null && bytes.length !== expectedLength)) {
    throw new RegistrationGateError(code);
  }
  return bytes;
}

export function encryptVerificationLink({
  verificationUrl,
  operationId,
  hmacKey,
  randomBytes = secureRandomBytes,
}) {
  const url = requiredText(verificationUrl, "INVALID_VERIFICATION_URL", 4_096);
  if (typeof randomBytes !== "function") {
    throw new RegistrationGateError("SECURE_RANDOM_REQUIRED");
  }
  const iv = Buffer.from(randomBytes(IV_BYTES));
  if (iv.length !== IV_BYTES) {
    throw new RegistrationGateError("SECURE_RANDOM_INVALID");
  }
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(hmacKey), iv);
  cipher.setAAD(associatedData(operationId));
  const ciphertext = Buffer.concat([
    cipher.update(url, "utf8"),
    cipher.final(),
  ]);
  return Object.freeze({
    version: ENVELOPE_VERSION,
    algorithm: ENVELOPE_ALGORITHM,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  });
}

export function decryptVerificationLink({ envelope, operationId, hmacKey }) {
  if (
    !envelope ||
    typeof envelope !== "object" ||
    Array.isArray(envelope) ||
    envelope.version !== ENVELOPE_VERSION ||
    envelope.algorithm !== ENVELOPE_ALGORITHM
  ) {
    throw new RegistrationGateError("VERIFICATION_LINK_ENVELOPE_INVALID");
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(hmacKey),
      encodedBytes(envelope.iv, "VERIFICATION_LINK_ENVELOPE_INVALID", IV_BYTES),
    );
    decipher.setAAD(associatedData(operationId));
    decipher.setAuthTag(
      encodedBytes(envelope.tag, "VERIFICATION_LINK_ENVELOPE_INVALID", TAG_BYTES),
    );
    const plaintext = Buffer.concat([
      decipher.update(
        encodedBytes(envelope.ciphertext, "VERIFICATION_LINK_ENVELOPE_INVALID"),
      ),
      decipher.final(),
    ]).toString("utf8");
    return requiredText(plaintext, "VERIFICATION_LINK_ENVELOPE_INVALID", 4_096);
  } catch (error) {
    if (error instanceof RegistrationGateError) throw error;
    throw new RegistrationGateError("VERIFICATION_LINK_ENVELOPE_INVALID");
  }
}

export const __test = Object.freeze({
  ENVELOPE_ALGORITHM,
  ENVELOPE_VERSION,
});
