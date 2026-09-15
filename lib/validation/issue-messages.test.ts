import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/i18n/messages/en.json";
import zhCN from "@/i18n/messages/zh-CN.json";
import {
  firstIssueMessage,
  translateFieldErrors,
  translateIssue,
} from "@/lib/validation/issue-messages";
import { signUpSchema, resetPasswordSchema } from "@/lib/validation/auth";
import { usernameSchema } from "@/lib/validation/username";
import { createOwnContributorSchema } from "@/lib/validation/profile";

// The REAL next-intl translator, over the real files, scoped the way every
// call site scopes it -- proving the structural ValidationTranslator type
// accepts it without a cast at the boundary.
const tEn = createTranslator({
  locale: "en",
  messages: en,
  namespace: "validation",
});
const tZh = createTranslator({
  locale: "zh-CN",
  messages: zhCN,
  namespace: "validation",
});

function fail(schema: { safeParse: (v: unknown) => unknown }, value: unknown) {
  const result = schema.safeParse(value) as {
    success: boolean;
    error: { issues: { message: string }[] };
  };
  if (result.success) throw new Error("expected the schema to reject");
  return result.error;
}

describe("schemas emit keys, not prose", () => {
  it("auth", () => {
    // Zod 4 does not abort at the first failing check, so an empty email
    // trips both the min(1) and the email() rule.
    const error = fail(signUpSchema, { email: "", password: "abc" });
    expect(error.issues.map((i) => i.message)).toEqual([
      "auth.emailRequired",
      "auth.emailInvalid",
      "auth.passwordTooShort",
    ]);
  });

  it("username", () => {
    expect(fail(usernameSchema, "admin").issues[0].message).toBe(
      "username.reserved",
    );
    expect(fail(usernameSchema, "-x").issues[0].message).toBe(
      "username.pattern",
    );
  });

  it("profile", () => {
    const error = fail(createOwnContributorSchema, {
      displayName: "",
      attributionType: "real_name",
      publicProfileEnabled: false,
      publicSlug: "",
      bio: "x".repeat(2001),
      homeCountryCode: "MYS",
    });
    expect(error.issues.map((i) => i.message)).toEqual([
      "common.displayNameRequired",
      "profile.bioTooLong",
      "profile.countryCode",
    ]);
  });
});

describe("translateIssue", () => {
  it("turns a key into the visitor's language, filling {min}/{max} from the issue", () => {
    const [emailIssue, , passwordIssue] = fail(signUpSchema, {
      email: "",
      password: "abc",
    }).issues as never[];
    expect(translateIssue(emailIssue, tEn)).toBe("Email is required.");
    expect(translateIssue(passwordIssue, tEn)).toBe(
      "Password must be at least 6 characters.",
    );
    expect(translateIssue(emailIssue, tZh)).toBe("请填写邮箱。");
    expect(translateIssue(passwordIssue, tZh)).toBe("密码至少需要 6 个字符。");
  });

  it("passes a message that is not a key through untouched", () => {
    // Zod's own default for a missing field: not ours to translate, and
    // exactly what the boundary showed before.
    const [issue] = fail(resetPasswordSchema, { password: "secret1" })
      .issues as never[];
    expect(translateIssue(issue, tEn)).toMatch(/expected string/);
    expect(translateIssue(issue, tZh)).toMatch(/expected string/);
  });
});

describe("firstIssueMessage", () => {
  it("returns the first issue translated", () => {
    const error = fail(signUpSchema, { email: "nope", password: "abcdef" });
    expect(firstIssueMessage(error as never, tEn, "common.invalidInput")).toBe(
      "Enter a valid email address.",
    );
    expect(firstIssueMessage(error as never, tZh, "common.invalidInput")).toBe(
      "请输入有效的邮箱地址。",
    );
  });

  it("falls back to the given key when there is no issue at all", () => {
    expect(
      firstIssueMessage({ issues: [] } as never, tZh, "common.invalidInput"),
    ).toBe("输入无效。");
  });
});

describe("translateFieldErrors", () => {
  it("groups translated messages by top-level field", () => {
    const error = fail(signUpSchema, { email: "", password: "abc" });
    expect(translateFieldErrors(error as never, tZh)).toEqual({
      email: ["请填写邮箱。", "请输入有效的邮箱地址。"],
      password: ["密码至少需要 6 个字符。"],
    });
  });
});
