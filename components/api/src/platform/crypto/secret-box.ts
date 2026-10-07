import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/** Authenticated encryption for secrets at rest (third-party tokens) and short-lived cookies. */
export class SecretBox {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== 32) throw new Error('the encryption key must be 32 bytes');
  }

  seal(plain: string): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]);
  }

  /** Throws when the payload was altered or sealed with another key. */
  open(sealed: Buffer): string {
    const decipher = createDecipheriv(ALGORITHM, this.key, sealed.subarray(0, IV_LENGTH));
    decipher.setAuthTag(sealed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
    const body = sealed.subarray(IV_LENGTH + TAG_LENGTH);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  }
}
