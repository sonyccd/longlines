// Mode canonicalization and families. Pure, no I/O.
//
// This module is the only place that decides what a mode string means.
// raw_spots.mode_family is derived here at ingest; SQL (spot_matches) only
// compares strings and never re-derives the family.

export type ModeFamily = "cw" | "phone" | "digital";

/**
 * Upstream labels that mean "some digital mode" without saying which.
 * SOTAwatch's spot form offers only DATA for every digital mode.
 */
const GENERIC_DIGITAL = new Set(["data", "digi", "digital", "dig"]);

const CW = new Set(["cw"]);
const PHONE = new Set([
  "ssb",
  "usb",
  "lsb",
  "fm",
  "am",
  "dv",
  "dstar",
  "dmr",
  "c4fm",
  "fusion",
  "phone",
]);
const DIGITAL = new Set([
  ...GENERIC_DIGITAL,
  "ft8",
  "ft4",
  "js8",
  "rtty",
  "psk",
  "psk31",
  "psk63",
  "olivia",
  "msk144",
  "jt65",
  "jt9",
  "q65",
  "fst4",
  "fst4w",
  "wspr",
  "sstv",
  "hell",
  "contestia",
  "thor",
  "mfsk",
]);

/**
 * Specific digital modes an operator might name in a comment when the
 * upstream mode field is blank or generic. An optional space or hyphen is
 * allowed inside ("FT-8", "PSK 31"). Word-bounded so "JS8Call" does not match.
 */
const COMMENT_HINT =
  /\b(ft[ -]?8|ft[ -]?4|js[ -]?8|rtty|psk[ -]?31|psk[ -]?63|olivia|msk[ -]?144|jt[ -]?65|jt[ -]?9|q[ -]?65|fst[ -]?4)\b/i;

/** Lowercase with whitespace and hyphens removed ("FT-8" -> "ft8"). Null when blank. */
export function canonicalMode(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.toLowerCase().replace(/[\s-]/g, "");
  return cleaned === "" ? null : cleaned;
}

/** The first specific digital mode named in a comment, canonical. Null when none. */
export function modeHintFromComment(comment: string): string | null {
  const match = COMMENT_HINT.exec(comment);
  return match?.[1] ? canonicalMode(match[1]) : null;
}

/**
 * The mode to store: the canonical upstream value, except that a blank or
 * generic digital label defers to a specific mode named in the comment.
 * An explicit specific upstream mode is never overridden.
 */
export function resolveMode(upstream: string | null | undefined, comment: string): string | null {
  const canonical = canonicalMode(upstream);
  if (canonical === null || GENERIC_DIGITAL.has(canonical)) {
    return modeHintFromComment(comment) ?? canonical;
  }
  return canonical;
}

export function modeFamily(mode: string | null): ModeFamily | null {
  if (mode === null) return null;
  if (CW.has(mode)) return "cw";
  if (PHONE.has(mode)) return "phone";
  if (DIGITAL.has(mode)) return "digital";
  return null;
}
