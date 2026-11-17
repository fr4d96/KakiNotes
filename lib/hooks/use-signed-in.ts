"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Whether the visitor has a session, read in the browser only.
 *
 * Public pages never read the session on the server (see SiteHeader's
 * "Session awareness" note): their HTML must be the same for everyone. So
 * this starts as `false` -- the signed-out view, which is what the server
 * rendered -- and flips once the browser Supabase client answers, then
 * follows sign-in / sign-out live. Same pattern as SiteHeader and
 * BottomTabBar.
 *
 * Display only. It must never decide access: anything a signed-in visitor
 * can do is re-checked on the server.
 */
export function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(!!data.session);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (active) setSignedIn(!!session);
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return signedIn;
}
