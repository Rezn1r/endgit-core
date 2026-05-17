const MIN_SECRET_LENGTH = 32;

export function requireSecret(name: string): string {
  const value = process.env[name];

  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must be configured with a secret of at least ${MIN_SECRET_LENGTH} characters.`);
  }

  return value;
}
