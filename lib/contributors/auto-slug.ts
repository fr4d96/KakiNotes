/**
 * Page addresses made for a contributor who didn't choose one (owner
 * decision 2026-11-21: everyone is listed in the Contributors directory, and
 * a listing needs an address). Built only from the display name, which is
 * already public on every story, so the address reveals nothing new.
 *
 * The result always matches the publicSlug rule in lib/validation/profile.ts
 * (3-60 characters, a-z 0-9 and hyphens, starting with a letter or digit).
 * Uniqueness is NOT checked here: the caller tries the candidates in order
 * and the unique index on contributors.public_slug decides, the same way a
 * typed address is decided.
 */

const FALLBACK = "contributor";
const MAX_BASE = 50; // leaves room for a "-NNNN" suffix under the 60 cap

/** "Kaki Ku" -> "kaki-ku"; "José Ñ" -> "jose-n"; "小明" -> "contributor". */
export function baseSlugFromName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop accents left by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_BASE)
    .replace(/-+$/g, "");
  return slug.length >= 3 ? slug : FALLBACK;
}

/**
 * The addresses to try, in order: the name itself, then -2 to -9, then one
 * random 4-character suffix as a last resort.
 */
export function slugCandidates(
  name: string,
  random: () => number = Math.random,
): string[] {
  const base = baseSlugFromName(name);
  const numbered = Array.from({ length: 8 }, (_, i) => `${base}-${i + 2}`);
  const suffix = Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, "0");
  return [base, ...numbered, `${base}-${suffix}`];
}
