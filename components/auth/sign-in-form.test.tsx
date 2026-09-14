import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "@/components/auth/sign-in-form";
import { setTestLocale } from "@/tests/support/i18n";

// "use server" modules pull in server-only under jsdom; the form's contract
// with the action is covered by app/(auth)/actions.test.ts.
vi.mock("@/app/(auth)/actions", () => ({
  signInAction: vi.fn(),
}));
vi.mock("@/components/auth/google-sign-in-button", () => ({
  GoogleSignInButton: () => <div>google</div>,
}));

afterEach(() => setTestLocale("en"));

describe("SignInForm", () => {
  it("labels its fields in English by default", () => {
    render(<SignInForm next="" />);
    expect(screen.getByLabelText("Email or username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Forgot your password?" }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("labels its fields in Chinese under zh-CN -- a Client Component this time", () => {
    setTestLocale("zh-CN");
    render(<SignInForm next="" />);
    // getByLabelText, not getByText: the label must still be associated
    // with its input after translation (Engineering Rule 19).
    expect(screen.getByLabelText("邮箱或用户名")).toHaveAttribute(
      "name",
      "identifier",
    );
    expect(screen.getByLabelText("密码")).toHaveAttribute("name", "password");
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "忘记密码？" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expect(screen.getByRole("link", { name: "注册" })).toHaveAttribute(
      "href",
      "/sign-up",
    );
  });
});
