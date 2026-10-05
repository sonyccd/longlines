// Same rule as the profiles.callsign check constraint in the database.
export const CALLSIGN_RE = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,4}[A-Z](\/[A-Z0-9]+)?$/;

export function normalizeCallsign(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidCallsign(value: string): boolean {
  return CALLSIGN_RE.test(normalizeCallsign(value));
}
