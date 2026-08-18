import { createHash, randomBytes } from 'node:crypto';

const DEMO_SESSION_TOKEN_BYTES = 32;

export function createDemoSessionToken(): string {
  return randomBytes(DEMO_SESSION_TOKEN_BYTES).toString('base64url');
}

export function digestDemoSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
