const COOKIE_NAME = 'photos_admin_session';
const SECRET_SALT = 'greater-china-portfolio-studio-v1';

export function getAdminCookieName() {
  return COOKIE_NAME;
}

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'admin123';
}

export async function computeSessionToken(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(`${password}:${SECRET_SALT}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const expected = await computeSessionToken(getAdminPassword());
  return token === expected;
}
