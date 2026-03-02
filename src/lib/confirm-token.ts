import { createHash, randomBytes } from 'crypto';

export function generateConfirmToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashConfirmToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyConfirmToken(token: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  return hashConfirmToken(token) === storedHash;
}
