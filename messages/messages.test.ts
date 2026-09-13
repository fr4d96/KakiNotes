import { describe, expect, it } from "vitest";
import en from "./en.json";
import zhCN from "./zh-CN.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

/**
 * Pulls the argument names out of an ICU message: `{count}`,
 * `{count, plural, ...}`, `{name, select, ...}`. Nested option bodies are
 * scanned too, so `{n, plural, one {# thing} other {# {kind}}}` yields
 * n and kind.
 */
function icuArguments(message: string): Set<string> {
  const names = new Set<string>();
  for (const match of message.matchAll(
    /\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,}]/g,
  )) {
    names.add(match[1]);
  }
  return names;
}

const enFlat = flatten(en as Tree);
const zhFlat = flatten(zhCN as Tree);

describe("messages", () => {
  it("zh-CN carries exactly the same keys as en", () => {
    const enKeys = [...enFlat.keys()].sort();
    const zhKeys = [...zhFlat.keys()].sort();
    const missing = enKeys.filter((k) => !zhFlat.has(k));
    const extra = zhKeys.filter((k) => !enFlat.has(k));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it("has no empty values in either language", () => {
    const empty = [
      ...[...enFlat].filter(([, v]) => v.trim() === "").map(([k]) => `en:${k}`),
      ...[...zhFlat].filter(([, v]) => v.trim() === "").map(([k]) => `zh:${k}`),
    ];
    expect(empty).toEqual([]);
  });

  it("uses the same ICU arguments in both languages", () => {
    // A translation that drops `{count}` or renames it would fail at
    // render time with a next-intl formatting error; catch it here instead.
    const mismatched: string[] = [];
    for (const [key, enValue] of enFlat) {
      const zhValue = zhFlat.get(key);
      if (zhValue === undefined) continue;
      const a = [...icuArguments(enValue)].sort().join(",");
      const b = [...icuArguments(zhValue)].sort().join(",");
      if (a !== b) mismatched.push(`${key}: en{${a}} zh{${b}}`);
    }
    expect(mismatched).toEqual([]);
  });

  it("does not leave English in the Chinese file where a translation is expected", () => {
    // Brand names, the "EN" glyph and a few technical tokens are legitimately
    // identical; anything else identical is almost certainly an untranslated
    // string. Keep this list short and honest.
    const allowed = new Set<string>();
    const identical = [...enFlat]
      .filter(([k, v]) => zhFlat.get(k) === v && !allowed.has(k))
      // A value with no Latin letters at all (pure punctuation/emoji) is
      // not a translation candidate either.
      .filter(([, v]) => /[A-Za-z]{3,}/.test(v))
      .map(([k]) => k);
    expect(identical).toEqual([]);
  });
});
