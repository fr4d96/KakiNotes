/** Client-safe half of bulk approve. Rules: lib/story/bulk-approve.ts. */

/**
 * Stories per request. Each one may copy photos between buckets, so a whole
 * page in one request could outlive the function; small chunks also give
 * the moderator progress, and a lost connection costs one chunk at most.
 */
export const BULK_APPROVE_CHUNK = 4;

/** One revision's outcome. `title` comes from the server, never the client. */
export type BulkApproveResult = {
  revisionId: string;
  title: string | null;
  ok: boolean;
  error?: string;
};

/** Split into requests of at most `size`, keeping order. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
