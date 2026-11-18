"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AppRole } from "@/lib/auth/staff-guard";

/**
 * Who is looking at the page, as the BROWSER knows it: signed in or not,
 * their avatar emoji, and their role. One store for the whole tab, shared by
 * SiteHeader, BottomTabBar and useSignedIn.
 *
 * Why a store and not per-component state (2026-11-18, "the avatar
 * disappears after tapping Home"): the contributor area's header
 * (ContributorNav) is rendered on the server, but every public page uses
 * SiteHeader, which learned the session client-side. Tapping Home from My
 * Stories swaps one header for the other, so SiteHeader mounted fresh with
 * no idea who you were. Worse, it read the avatar from `profiles`, while
 * Account has saved it to `contributors` since 2026-09-10
 * (20260910090000_contributor_public_identity.sql) -- so even once the
 * session came back, the chosen emoji did not. Now:
 *  - the avatar is read the way the server reads it
 *    (lib/auth/roles.ts getCurrentUserAvatarEmoji): contributors first,
 *    profiles as the fallback;
 *  - the state outlives any one header, so a remount starts from what the
 *    tab already knows instead of from "signed out";
 *  - a header the server rendered for a proven session seeds it
 *    (ViewerIdentitySeed), so the very first public page after the
 *    contributor area is already right;
 *  - only an explicit sign-out (or a session lookup that answered "none")
 *    clears it -- a failed lookup (offline, a refresh that errored) keeps
 *    what we knew rather than blinking the avatar out.
 *
 * Display only, like everything it replaced: the role picks which menu
 * links are drawn, the session picks Sign in vs. avatar. Access is decided
 * by proxy.ts, the route-group layouts and RLS, never by this
 * (Engineering Rules 2-3). Both reads are the caller's own rows under RLS
 * ("contributors: owner reads own contributor record", "profiles: owner
 * reads own profile", "user_roles: read own role"). Public pages' server HTML
 * still carries nothing per-person: the server snapshot is always "unknown".
 */
export type ViewerIdentity = {
  status: "unknown" | "signed-in" | "signed-out";
  avatarEmoji: string | null;
  role: AppRole | null;
};

const UNKNOWN: ViewerIdentity = {
  status: "unknown",
  avatarEmoji: null,
  role: null,
};
const SIGNED_OUT: ViewerIdentity = {
  status: "signed-out",
  avatarEmoji: null,
  role: null,
};

let state: ViewerIdentity = UNKNOWN;
/** Whose avatar/role `state` holds (or is loading), so it is read once. */
let loadedFor: string | null = null;
/** Set by a server seed: the avatar/role are already right for this session. */
let seeded = false;
let started = false;
let unsubscribeAuth: (() => void) | null = null;
const listeners = new Set<() => void>();

function setState(next: ViewerIdentity) {
  if (
    next.status === state.status &&
    next.avatarEmoji === state.avatarEmoji &&
    next.role === state.role
  ) {
    return;
  }
  state = next;
  listeners.forEach((listener) => listener());
}

function markSignedOut() {
  loadedFor = null;
  seeded = false;
  setState(SIGNED_OUT);
}

function markSignedIn(userId: string) {
  if (state.status !== "signed-in") {
    setState({ ...state, status: "signed-in" });
  }
  if (loadedFor === userId) return;
  loadedFor = userId;
  // A seed came from the server for this same session: nothing to fetch.
  if (seeded) return;
  void loadIdentity(userId);
}

async function loadIdentity(userId: string) {
  try {
    await readIdentity(userId);
  } catch {
    // Offline or a failed read: keep what we knew, and let the next auth
    // event (or page) try again.
    if (loadedFor === userId) loadedFor = null;
  }
}

async function readIdentity(userId: string) {
  const supabase = createClient();
  const [contributor, profile, roleRow] = await Promise.all([
    supabase
      .from("contributors")
      .select("avatar_emoji")
      .eq("linked_user_id", userId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("avatar_emoji")
      .eq("id", userId)
      .maybeSingle(),
    // maybeSingle(): an account with no role row is an ordinary
    // contributor, not an error worth logging.
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  // Signed out (or switched account) while this was in flight.
  if (loadedFor !== userId || state.status !== "signed-in") return;
  setState({
    status: "signed-in",
    avatarEmoji:
      contributor.data?.avatar_emoji ?? profile.data?.avatar_emoji ?? null,
    role: (roleRow.data?.role as AppRole | undefined) ?? null,
  });
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const supabase = createClient();

  supabase.auth.getSession().then(({ data, error }) => {
    if (data.session) markSignedIn(data.session.user.id);
    // "No session" is an answer; an error (offline, a refresh that failed)
    // is not -- keep whatever we knew.
    else if (!error) markSignedOut();
  });

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    // Deferred: supabase-js holds its auth lock while it runs these
    // callbacks, and loadIdentity's queries need that lock.
    setTimeout(() => {
      if (session) markSignedIn(session.user.id);
      else if (event === "SIGNED_OUT") markSignedOut();
    }, 0);
  });
  unsubscribeAuth = () => data.subscription.unsubscribe();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;
// Server HTML (and hydration) is always the anonymous view.
const getServerSnapshot = () => UNKNOWN;

export function useViewerIdentity(): ViewerIdentity {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * What a server-rendered header already proved: a session, this avatar and
 * this role. Applied before paint on the client so a public header that
 * mounts next (tapping Home from My Stories) starts signed in.
 */
export function seedViewerIdentity(seed: {
  avatarEmoji: string | null;
  role: AppRole | null;
}) {
  seeded = true;
  setState({ status: "signed-in", ...seed });
}

/** After the viewer changes their avatar (Settings), without a reload. */
export function setViewerAvatar(avatarEmoji: string | null) {
  if (state.status !== "signed-in") return;
  setState({ ...state, avatarEmoji });
}

/**
 * Renders nothing; seeds the store from a header the server rendered for a
 * proven session (ContributorNav and the staff headers).
 */
export function ViewerIdentitySeed({
  avatarEmoji,
  role,
}: {
  avatarEmoji: string | null;
  role: AppRole | null;
}) {
  useEffect(() => {
    seedViewerIdentity({ avatarEmoji, role });
  }, [avatarEmoji, role]);
  return null;
}

/** Tests only: forget everything, as a fresh tab would. */
export function resetViewerIdentityForTests() {
  unsubscribeAuth?.();
  unsubscribeAuth = null;
  state = UNKNOWN;
  loadedFor = null;
  seeded = false;
  started = false;
  listeners.clear();
}
