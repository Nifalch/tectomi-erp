import { Injectable, OnModuleInit, InternalServerErrorException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Symmetric encryption helper for the credential vault.
 *
 *   Algorithm: AES-256-GCM
 *   IV:        12 random bytes per encryption (recommended for GCM)
 *   Tag:       16 bytes auth tag (default GCM tag length)
 *   Key:       32 raw bytes, loaded once at startup from CREDENTIAL_VAULT_KEY
 *              (base64-encoded). We accept either base64 or a 64-char hex
 *              string so ops can paste whichever format they generated.
 *
 * Wire format on disk:
 *   "<base64(iv)>.<base64(ciphertext)>.<base64(tag)>"
 *
 * Decryption fails (throws) on auth-tag mismatch, so any DB-side tamper or a
 * mistakenly-rotated key is caught loudly rather than returning silent garbage.
 */
@Injectable()
export class CredentialCryptoService implements OnModuleInit {
  private key: Buffer | null = null;

  onModuleInit() {
    const raw = process.env.CREDENTIAL_VAULT_KEY;
    if (!raw || raw.trim().length === 0) {
      // Don't crash the whole app — credential routes will reject requests
      // with a clear error and every other module keeps working. Surface a
      // loud warning at boot so the misconfiguration isn't easy to miss.
      // eslint-disable-next-line no-console
      console.warn(
        "[CredentialCryptoService] CREDENTIAL_VAULT_KEY is missing — credential vault will be disabled until it is set.",
      );
      return;
    }

    let key: Buffer;
    if (/^[A-Fa-f0-9]{64}$/.test(raw)) {
      key = Buffer.from(raw, "hex");
    } else {
      key = Buffer.from(raw, "base64");
    }
    if (key.length !== 32) {
      // eslint-disable-next-line no-console
      console.warn(
        `[CredentialCryptoService] CREDENTIAL_VAULT_KEY must decode to exactly 32 bytes (got ${key.length}). Vault disabled.`,
      );
      return;
    }
    this.key = key;
  }

  isReady(): boolean {
    return this.key !== null;
  }

  encrypt(plaintext: string): string {
    if (!this.key) {
      throw new InternalServerErrorException(
        "Credential vault is not configured. Set CREDENTIAL_VAULT_KEY in the API environment.",
      );
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString("base64"), enc.toString("base64"), tag.toString("base64")].join(".");
  }

  decrypt(payload: string): string {
    if (!this.key) {
      throw new InternalServerErrorException(
        "Credential vault is not configured. Set CREDENTIAL_VAULT_KEY in the API environment.",
      );
    }
    const parts = payload.split(".");
    if (parts.length !== 3) {
      throw new InternalServerErrorException("Stored credential payload is corrupt.");
    }
    const [ivB64, ctB64, tagB64] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const ct = Buffer.from(ctB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    try {
      const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
      return dec.toString("utf8");
    } catch {
      // Auth tag mismatch — wrong key, tamper, or truncation. Don't leak details.
      throw new InternalServerErrorException(
        "Could not decrypt credential. The vault key may have changed.",
      );
    }
  }

  /**
   * Encrypts a JS value by JSON-stringifying it first. The plain values for
   * each `CredentialType` are stored as a structured object (see DTOs) so
   * callers don't have to think about serialization themselves.
   */
  encryptJSON(value: unknown): string {
    return this.encrypt(JSON.stringify(value));
  }

  decryptJSON<T = unknown>(payload: string): T {
    const raw = this.decrypt(payload);
    return JSON.parse(raw) as T;
  }
}
