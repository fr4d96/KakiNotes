import { z } from "zod";

/**
 * The "See more" cursor, as the client sends it back to the server.
 * offset: true -- Postgres returns created_at as "...+00:00", not "...Z";
 * without it every real cursor fails to parse (the v4.9.1 stories bug).
 */
export const notificationsCursorSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});
