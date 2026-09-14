import { z } from "zod";

// Every `message` here is a KEY into messages/<locale>.json's `validation`
// namespace, translated at the trust boundary by
// lib/validation/issue-messages.ts -- see that file for why a schema never
// carries prose of its own. `{min}`/`{max}` in a message are filled from the
// issue's own `minimum`/`maximum`, so the numbers below are the single source.

// Mirrors supabase/config.toml [auth] minimum_password_length = 6. Kept in
// sync manually — see docs/architecture.md "Manual Supabase settings".
const MIN_PASSWORD_LENGTH = 6;

export const emailSchema = z
  .string()
  .trim()
  .min(1, "auth.emailRequired")
  .email("auth.emailInvalid");

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, "auth.passwordTooShort")
  .max(128, "auth.passwordTooLong");

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z
    .string()
    .trim()
    .min(1, "common.displayNameRequired")
    .max(120, "common.displayNameTooLong")
    .optional()
    .or(z.literal("")),
});

/**
 * The sign-in field accepts an email OR a username, so it is deliberately
 * validated as "not empty" and nothing more. Enforcing the username shape
 * here would make the login box answer "is this even a valid username?"
 * before any credential is checked — a free format oracle, and a tell that
 * the field takes usernames at all. Anything that is neither shape is
 * classified as unresolvable by lib/auth/sign-in-identifier.ts and folded
 * into the same generic credential error as a wrong password.
 */
export const signInSchema = z.object({
  identifier: z.string().trim().min(1, "auth.identifierRequired"),
  password: z.string().min(1, "auth.passwordRequired"),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "auth.passwordsMismatch",
    path: ["confirmPassword"],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
