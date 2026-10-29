import "server-only";
import { z } from "zod";

/**
 * Only the Supabase-related vars live here, so importing this module (and
 * therefore validating/loading it) is scoped to code paths that actually talk
 * to Supabase — public pages that never touch Supabase never pay for this.
 */
const supabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({
    message:
      "NEXT_PUBLIC_SUPABASE_URL is missing or not a valid URL. Copy .env.example to .env.local and fill in your Supabase development project's URL.",
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1, {
    message:
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing. Copy .env.example to .env.local and fill in your Supabase development project's publishable key.",
  }),
});

const parsed = supabaseEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

if (!parsed.success) {
  const messages = parsed.error.issues.map((issue) => `- ${issue.message}`);
  throw new Error(
    `Invalid or missing environment variables:\n${messages.join("\n")}`,
  );
}

export const env = parsed.data;

/**
 * Service-role/admin env vars — a deliberately separate schema and export
 * from `env` above, so nothing that imports this module for the ordinary
 * publishable-key config also silently pulls in the secret schema. Only
 * `lib/supabase/admin.ts` and `lib/story/image-pipeline.ts` (the one narrow
 * module that module is allowed to be imported from) ever read `adminEnv`.
 */
const adminEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, {
    message:
      "SUPABASE_SERVICE_ROLE_KEY is missing. Required for the image-processing pipeline (lib/story/image-pipeline.ts) — never expose this to browser-accessible code (Engineering Rule 1).",
  }),
});

let cachedAdminEnv: z.infer<typeof adminEnvSchema> | undefined;

export function getAdminEnv() {
  if (!cachedAdminEnv) {
    const parsedAdmin = adminEnvSchema.safeParse({
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
    if (!parsedAdmin.success) {
      const messages = parsedAdmin.error.issues.map(
        (issue) => `- ${issue.message}`,
      );
      throw new Error(
        `Invalid or missing environment variables:\n${messages.join("\n")}`,
      );
    }
    cachedAdminEnv = parsedAdmin.data;
  }
  return cachedAdminEnv;
}

/**
 * Google Drive OAuth env vars — a third, separate schema from `env`/
 * `adminEnv` above, for the same reason: importing this module for the
 * ordinary config should never force these to be present. Only
 * lib/drive/token-store.ts and the app/(contributor)/account/drive/*
 * routes/actions ever read `getDriveEnv()`. None of these may be
 * `NEXT_PUBLIC_`-prefixed — see docs/google-drive-integration.md section 2.
 *
 * Preview/CI builds (Vercel previews, this repo's CI) legitimately have no
 * Drive credentials configured yet, so `isDriveConfigured()` below reports
 * that honestly instead of `getDriveEnv()` throwing — the UI uses it to
 * hide the Connect button rather than crash the Account page.
 */
const driveEnvSchema = z.object({
  GOOGLE_DRIVE_OAUTH_CLIENT_ID: z.string().min(1, {
    message: "GOOGLE_DRIVE_OAUTH_CLIENT_ID is missing.",
  }),
  GOOGLE_DRIVE_OAUTH_CLIENT_SECRET: z.string().min(1, {
    message: "GOOGLE_DRIVE_OAUTH_CLIENT_SECRET is missing.",
  }),
  GOOGLE_DRIVE_OAUTH_REDIRECT_URI: z.string().url({
    message: "GOOGLE_DRIVE_OAUTH_REDIRECT_URI is missing or not a valid URL.",
  }),
  // Must decode to exactly 32 bytes — the key size AES-256-GCM requires.
  // Checked here, at the boundary, so a misconfigured key fails loudly at
  // startup rather than failing confusingly inside token-store.ts's cipher
  // call the first time someone connects.
  GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(1, { message: "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY is missing." })
    .refine(
      (value) => {
        try {
          return Buffer.from(value, "base64").length === 32;
        } catch {
          return false;
        }
      },
      {
        message:
          "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY must be base64 that decodes to exactly 32 bytes (an AES-256 key).",
      },
    ),
});

let cachedDriveEnv: z.infer<typeof driveEnvSchema> | undefined;

function readDriveEnvInput() {
  return {
    GOOGLE_DRIVE_OAUTH_CLIENT_ID: process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
    GOOGLE_DRIVE_OAUTH_CLIENT_SECRET:
      process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET,
    GOOGLE_DRIVE_OAUTH_REDIRECT_URI:
      process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI,
    GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY:
      process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY,
  };
}

export function getDriveEnv() {
  if (!cachedDriveEnv) {
    const parsedDrive = driveEnvSchema.safeParse(readDriveEnvInput());
    if (!parsedDrive.success) {
      const messages = parsedDrive.error.issues.map(
        (issue) => `- ${issue.message}`,
      );
      throw new Error(
        `Invalid or missing environment variables:\n${messages.join("\n")}`,
      );
    }
    cachedDriveEnv = parsedDrive.data;
  }
  return cachedDriveEnv;
}

/**
 * True only when every Drive env var is present and valid. Used by the
 * Account settings UI to hide the Connect button and show "not available
 * here" instead of letting getDriveEnv() throw and break the whole page —
 * Vercel preview builds legitimately have none of these set.
 */
export function isDriveConfigured(): boolean {
  return driveEnvSchema.safeParse(readDriveEnvInput()).success;
}
