import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

const restrictedAdminClientImport = {
  name: "@/lib/supabase/admin",
  message:
    "lib/supabase/admin.ts (the service-role client) may only be imported from the three narrow modules that own a genuine privileged boundary: lib/story/image-pipeline.ts (image processing/promotion), lib/auth/username-login.ts (username-to-email resolution at sign-in, which has no anon-safe alternative — see that file's header), and lib/drive/token-store.ts (the only module allowed to read/write contributor_drive_connections, which carries an encrypted secret no RLS policy exposes to anyone — see that table's migration). Add the function you need to one of them instead of importing the admin client directly.",
};

const restrictedDriveTokenStoreImport = {
  name: "@/lib/drive/token-store",
  message:
    "lib/drive/token-store.ts holds the only code path that may read/write contributor_drive_connections (an encrypted secret — see its migration's header). Only lib/drive/** and the app/(contributor)/account/drive/* routes/actions may import it. Add the function you need there instead of importing token-store.ts directly from elsewhere.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettierConfig,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [restrictedAdminClientImport, restrictedDriveTokenStoreImport],
        },
      ],
    },
  },
  {
    // token-store.ts's own import allowlist: the rest of lib/drive/** and
    // the drive routes/actions are the only callers permitted to import
    // it directly (see restrictedDriveTokenStoreImport's message). They
    // still may not import the admin client directly — only
    // lib/drive/token-store.ts itself gets that, in the block below, which
    // is listed after this one so it wins for that one file (flat config
    // rule objects replace, not merge, on overlapping matches).
    files: ["lib/drive/**", "app/(contributor)/account/drive/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [restrictedAdminClientImport] },
      ],
    },
  },
  {
    // The service-role allowlist. Adding a file here widens the platform's
    // single most privileged boundary (Engineering Rule 1) — each entry
    // must justify itself in its own header comment. lib/drive/token-store.ts
    // is also the only module allowed to import itself's own table, so both
    // restrictions are off here, same as the other two entries.
    files: [
      "lib/story/image-pipeline.ts",
      "lib/auth/username-login.ts",
      "lib/drive/token-store.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    "supabase/.temp/**",
    // Claude Code's isolated worktrees -- full checkouts of this repo with
    // their own node_modules and .next output. Same exclusion as
    // vitest.config.ts and .prettierignore carry, for the same reason.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
