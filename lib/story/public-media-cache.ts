/**
 * CDN caching for published, Drive-backed photos served by the /media
 * proxy (app/media/[mediaId]/route.ts).
 *
 * A published photo is cached by Vercel's CDN for days, not minutes: every
 * cache miss is a Supabase check, a Google token and a full Drive download
 * (measured 1.9-5s on the live site, against ~0.1s for a hit). Long caching
 * is only safe because removal does not wait for it to expire: every
 * response carries PUBLIC_MEDIA_TAG, and every action that changes what is
 * public purges that tag immediately (purgePublicMediaCache() in
 * lib/story/public-cache.ts, called from the same helpers that already
 * clear the public page caches). See docs/google-drive-integration.md,
 * "Caching for published media".
 *
 * One tag for all photos, not one per story: the purge sites do not all
 * know which photos changed, and a purge only costs speed (the next viewers
 * go back to Drive once), never correctness.
 */
export const PUBLIC_MEDIA_TAG = "public-media";

/** 7 days in the CDN; a further day may be served stale while it refreshes. */
export const PUBLIC_MEDIA_CACHE_CONTROL =
  "public, s-maxage=604800, stale-while-revalidate=86400";
