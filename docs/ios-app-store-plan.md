# Kakinotes on the App Store — plan

Status: **planned, nothing built.** Written 2026-11-19. Start once the external 500 GB SSD is set
up (Phase 1). Everything here is a proposal until the owner decision in Phase 0 is recorded.

## Goal

Ship Kakinotes as a native iOS app on the App Store, without rewriting the product. The app is a
thin native shell (Capacitor) that loads the live Next.js site, plus the native features Apple
expects and the account and safety features App Review requires.

### Why a shell, not a rewrite

- The app depends on the server: Server Components, server actions, the `/media` Drive proxy and
  server-side Supabase (Rules 1, 13 and 14). A static export can't be bundled inside the app, so the
  shell loads the deployed site.
- A React Native or Swift rewrite would mean months of work and two codebases, each repeating every
  RLS-adjacent check.
- Web deploys (push to `release`) reach the app straight away, with no new App Review. Only changes
  to the native shell need a new build.

### Rough effort

| Phase                         | Part-time estimate |
| ----------------------------- | ------------------ |
| 0–1 Decisions + Mac/SSD setup | 1–2 days           |
| 2 Capacitor shell             | 2–3 days           |
| 3 Sign-in, Drive, deep links  | 3–5 days           |
| 4 Native features             | 4–6 days           |
| 5 App Review requirements     | 4–6 days           |
| 6 TestFlight + submission     | 1–2 weeks elapsed  |

About **3–4 weeks part-time**, allowing for one or two rejection rounds.

---

## Phase 0 — Decisions and accounts

- [ ] **Record the owner decision** that overrides "native apps" in
      [product-spec.md → MVP non-goals](product-spec.md#mvp-non-goals). Use the same narrow-override
      wording as the affirmation-notes exception: an iOS shell around the existing web app; no
      Android, no offline mode, no app-only features. Log it in
      [implementation-status.md](implementation-status.md).
- [ ] **Apple Developer Program**, US$99 a year. Choose **Individual** (fast, but your legal name
      shows as the seller) or **Organization** (needs a registered business and a D-U-N-S number,
      which can take 1–2 weeks). Decide this first, because it gates everything else.
- [ ] Choose the **bundle ID** (for example `com.kakinotes.app`; it can never be changed) and check
      that the name "Kakinotes" is free in App Store Connect.
- [ ] **iPhone only** at launch. Supporting iPad would also mean iPad screenshots and iPad-layout
      review.
- [ ] A dedicated **App Review Google account** (fictional, owned by you) for the demo contributor.
      See Phase 6.

## Phase 1 — Mac setup on the external SSD

The internal disk is too full for Xcode, so put the large Xcode files on the SSD.

1. Format the SSD as **APFS** in Disk Utility and name it, for example, `KakiSSD`.
2. Download **Xcode** as a `.xip` from developer.apple.com/download, not the Mac App Store (the
   App Store version always installs to the internal disk). Expand it on the SSD:
   `/Volumes/KakiSSD/Applications/Xcode.app`.
3. Point the command-line tools at it:
   ```bash
   sudo xcode-select -s /Volumes/KakiSSD/Applications/Xcode.app/Contents/Developer
   ```
4. In Xcode → Settings → Locations, move **Derived Data** and **Archives** to the SSD.
5. Move the simulators to the SSD as well. Quit Xcode, then:
   ```bash
   mv ~/Library/Developer/CoreSimulator /Volumes/KakiSSD/CoreSimulator && ln -s /Volumes/KakiSSD/CoreSimulator ~/Library/Developer/CoreSimulator
   ```
   Install only the latest iOS simulator runtime, for the iPhone 17.
6. The repo and Node stay on the internal disk. The SSD must be plugged in whenever you build or
   run Xcode.
7. Afterwards: update the `ios-mobile-focus` memory. The Simulator becomes a real test surface; the
   iPhone 17 frame at `/dev/iphone-17` stays for quick web checks.

## Phase 2 — Capacitor shell

1. Install the dependencies (Rule 20 — reason: native iOS shell, push, share and deep links):
   ```bash
   npm i @capacitor/core @capacitor/ios @capacitor/app @capacitor/browser @capacitor/share @capacitor/haptics @capacitor/status-bar @capacitor/splash-screen @capacitor/push-notifications @capacitor/network
   ```
   ```bash
   npm i -D @capacitor/cli
   ```
2. Run `npx cap init Kakinotes <bundle-id>` and `npx cap add ios`. Commit the generated `ios/`
   folder.
3. In `capacitor.config.ts`:
   - Set `server.url` to the production domain, and limit `server.allowNavigation` to the
     Kakinotes domain only. Never use a wildcard: any other origin opens in the system browser.
   - Point `webDir` at a tiny local folder (for example `ios-shell/www`) that holds only the **offline
     screen**: "You're offline — Kakinotes needs a connection." No service worker and no cached
     content (Rules 12–13 stay in force).
4. Reuse the existing assets for the app icon and launch screen (`public/kakinotes-icon.png`,
   `public/splash`). The icon must be 1024×1024 with no transparency: render it at 1024 the way
   `scripts/generate-app-icons.mjs` does (sketch on its paper colour, opaque).
5. Add a small `lib/native/` client module that checks `Capacitor.isNativePlatform()`, so that web
   and PWA users see no change. Never trust it on the server: it is a UI hint, not an authority
   (Rule 2).
6. Check that sign-in cookies survive an app restart. WKWebView keeps cookies, but confirm with
   Supabase SSR.

## Phase 3 — Sign-in, Google Drive, deep links (the hard part)

**The problem.** Google blocks its sign-in page inside embedded web views (`disallowed_useragent`),
and every ordinary contributor **must** connect Google Drive. So the current flow,
`app/(contributor)/account/drive/connect/route.ts` → Google →
`app/(contributor)/account/drive/callback/route.ts`, cannot run inside the shell.

**The design.**

1. In the app, "Connect Google Drive" opens the connect URL in the **system browser sheet**
   (`@capacitor/browser`, i.e. `SFSafariViewController`).
2. That sheet does **not** share the WebView's cookies, so it doesn't know who is signed in. Before
   opening it, the app calls a server action that mints a **single-use handoff token**: short-lived
   (about 2 minutes), hashed in a table with RLS, bound to `auth.uid()` on the server, and never
   chosen by the client (Rule 2).
3. `/account/drive/connect?handoff=<token>` checks and spends the token, then runs the existing
   OAuth `state` flow for that user.
4. The callback stores the Drive tokens server-side as it does today, then redirects to a **universal
   link** (`https://<domain>/account/drive?connected=1`). That closes the sheet and returns to the
   app, which reloads the page.
5. Universal links need an **Associated Domains** entitlement in Xcode, plus
   `app/.well-known/apple-app-site-association/route.ts` serving JSON for the app ID. Limit the
   paths it claims to `/account/*` and `/auth/*`.
6. Send the email links (sign-up confirmation, password reset → `app/auth/callback`) through the
   same universal links, so they open in the app rather than in Safari.
7. Tests: unit-test the token (single use, expired, wrong user); add a Playwright check that the
   web flow is unchanged.

Sign in with Apple (Guideline 4.8) is **not** required. Kakinotes signs people in with email or
username, and connecting Drive is not a login. Re-check this if Google sign-in is ever added.

## Phase 4 — Native features (passing Guideline 4.2, "minimum functionality")

Apple rejects apps that are only a website in a frame. Ship at least these:

- [ ] **Push notifications.** A new `device_tokens` table: owner-only RLS, a token upserted through
      a SECURITY DEFINER RPC keyed on `auth.uid()`. Send from the server with an **APNs auth key
      (.p8), kept server-only** like the service-role key (Rule 1). First events:
  - your story was approved or sent back (moderation decision),
  - you received a new affirmation note.
  - Ask for push permission after the first meaningful action, not on first launch.
- [ ] **Native share sheet** for stories (`@capacitor/share`), in place of copying the link.
- [ ] **Haptics** on the tab bar and primary buttons (respecting reduced motion).
- [ ] **Status bar** that follows the light/dark theme.
- [ ] **Offline screen** (Phase 2) driven by `@capacitor/network`.
- [ ] Photo picking: the existing `<input type="file">` already opens the native picker in WKWebView.
      Check HEIC upload end to end (the `heic-decode` path).

## Phase 5 — App Review requirements

- [ ] **In-app account deletion (Guideline 5.1.1(v)) — not built yet.** Settings → Delete account.
      This needs a design pass in
      [content-governance.md](content-governance.md): what happens to published stories, Drive
      photos and the Drive token (revoke it with Google), notes and reports. Story reports already
      survive deletion (`reporter_id` is set to null).
- [ ] **User-generated content (Guideline 1.2).**
  - Story reporting **exists** (`app/(public)/stories/[id]/actions.ts`, `/moderation/reports`).
  - **Affirmation notes** come from anyone holding a link, so they need a **report or hide** action
    on each note and a way to **block** a share link (revoke it). Apple checks this.
  - A published contact email (in the footer and on the App Store listing).
- [ ] **Privacy.** `/privacy` exists. Bring it up to date (push tokens, Drive). Fill in the App
      Privacy "nutrition labels": email, user content, photos and the device token are linked to the
      user; no tracking. Omit the `NSUserTrackingUsageDescription` key.
- [ ] **Export compliance.** The app uses only standard HTTPS, so set
      `ITSAppUsesNonExemptEncryption = NO` in `Info.plist`.
- [ ] **Age rating questionnaire.** Answer it with user-generated content in mind.
- [ ] Keep the "personal experience, not advice" label on every story (Rule 17). Reviewers read it
      kindly for travel or visa content.

**Migration warning:** the Supabase dev project **is** production (`yzaonhjieupxyrmbienf`). The
`device_tokens`, handoff-token and account-deletion migrations go live as soon as they are applied.
Ship each migration additively, and before the code that uses it.

## Phase 6 — TestFlight and submission

1. In Xcode: set the signing team and capabilities (**Push Notifications**, **Associated Domains**),
   then Product → Archive → Distribute → App Store Connect.
2. **TestFlight** on your own iPhone for at least a week of daily use. Test sign-in, Drive connect,
   photo upload, push, universal links, offline mode and dark mode.
3. App Store Connect listing: name, subtitle, description, keywords, support URL, privacy policy URL,
   **6.9" iPhone screenshots** (3–5, made from fictional seed stories only, per Rule 22).
4. **App Review notes** (the most common cause of rejection when they're missing):
   - A demo contributor account (fictional), **already connected to the dedicated review Google
     account**, so the reviewer never hits the mandatory Drive gate.
   - One sentence explaining the moderation and reporting flow, plus where to find Delete account.
5. Submit. Reviews usually come back in 1–3 days. If it's rejected, reply in Resolution Center with
   the change made. Don't argue in circles.

## After launch

- Web changes ship through `release` as usual; the app picks them up without review. Don't use this
  to change what the app fundamentally is (Guideline 2.3.1). Big changes still deserve a native
  version bump.
- Native shell changes (new plugins, icon, entitlements) → new build → TestFlight → review.
- Rebuild once a year for each new required Xcode/iOS SDK. Apple raises the minimum SDK every April.
- Renew the Apple Developer membership every year, or the app is removed from sale.

## Open questions

1. Individual or Organization developer account?
2. Bundle ID and the exact store name.
3. What account deletion does to published stories: remove them, or keep them anonymised?
4. Push events beyond the first two.
