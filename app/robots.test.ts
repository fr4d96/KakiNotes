import { describe, expect, it } from "vitest";
import robots from "./robots";

function disallowed(): string[] {
  const rules = robots().rules;
  const first = Array.isArray(rules) ? rules[0] : rules;
  const value = first.disallow;
  return Array.isArray(value) ? value : value ? [value] : [];
}

describe("robots", () => {
  it("keeps crawlers out of the private affirmation-notes surfaces", () => {
    // /notes/<token> URLs are private capabilities: whoever holds one can
    // write a note, so they must never be crawled or indexed.
    expect(disallowed()).toContain("/notes/");
    expect(disallowed()).toContain("/affirmations");
  });

  it("still disallows the other contributor and staff surfaces", () => {
    for (const path of ["/my-stories", "/account", "/admin", "/moderation"]) {
      expect(disallowed()).toContain(path);
    }
  });
});
