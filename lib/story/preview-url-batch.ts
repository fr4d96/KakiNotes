/**
 * How many media ids one mintPreviewUrlsAction() call will accept
 * (app/(contributor)/stories/[id]/media-actions.ts). A story revision's own
 * attached-media list is the realistic upper bound and sits well under
 * this; the cap exists so a caller cannot turn one Server Action into an
 * unbounded fan-out of authorize + sign requests.
 *
 * Lives here rather than next to the action because a "use server" module
 * may only export async functions -- the client-side batcher
 * (lib/story/preview-url-client.ts) needs the same number to chunk by.
 */
export const MAX_PREVIEW_URLS_PER_BATCH = 100;
