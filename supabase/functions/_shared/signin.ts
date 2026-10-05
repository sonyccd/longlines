// Pure helpers for the sign-in function.

export const GENERIC_SIGN_IN_ERROR = "That callsign or email and password don't match.";
export const RATE_LIMIT_SUFFIX = "Too many attempts. Try again in a few minutes.";
export const MAX_ATTEMPTS_PER_WINDOW = 10; // per identifier per 15 minutes

export interface SignInBody {
  identifier: string;
  password: string;
}

export function isEmailIdentifier(identifier: string): boolean {
  return identifier.includes("@");
}

/** Emails lowercase, callsigns uppercase, both trimmed. */
export function normalizeIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  return isEmailIdentifier(trimmed) ? trimmed.toLowerCase() : trimmed.toUpperCase();
}

export function parseSignInBody(body: unknown): SignInBody {
  if (typeof body !== "object" || body === null) throw new Error("expected an object");
  const { identifier, password } = body as Record<string, unknown>;
  if (typeof identifier !== "string" || identifier.trim() === "") {
    throw new Error("identifier required");
  }
  if (typeof password !== "string" || password === "") throw new Error("password required");
  return { identifier, password };
}

/** Same message whether the account exists or not; a suffix once rate limited. */
export function signInErrorMessage(attemptsInWindow: number): string {
  return attemptsInWindow > MAX_ATTEMPTS_PER_WINDOW
    ? `${GENERIC_SIGN_IN_ERROR} ${RATE_LIMIT_SUFFIX}`
    : GENERIC_SIGN_IN_ERROR;
}
