import { z } from "zod";

/**
 * Query-param/form validation for the Google Drive connect flow
 * (app/(contributor)/account/drive/*, docs/google-drive-integration.md
 * section 2). Every schema here guards a trust boundary: a query string or
 * form field an attacker fully controls.
 */

/** Google's callback redirect: either `code`+`state`, or an `error`. */
export const driveCallbackQuerySchema = z.object({
  code: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  error: z.string().trim().min(1).optional(),
});

export type DriveCallbackQuery = z.infer<typeof driveCallbackQuerySchema>;

/**
 * The disconnect form's one field: the contributor must explicitly tick a
 * box acknowledging the section-8 warning before the Server Action will
 * even look at the request. A plain "confirm" button a script could
 * replay without the checkbox ever being shown is exactly what this
 * guards against -- see app/(contributor)/account/drive/actions.ts.
 */
export const disconnectDriveSchema = z.object({
  confirmed: z.literal("true", {
    message: "drive.confirmationRequired",
  }),
});

export type DisconnectDriveInput = z.infer<typeof disconnectDriveSchema>;

/**
 * The Drive media proxy route's one path param
 * (app/media/[mediaId]/route.ts). A malformed value is treated identically
 * to "not found" by the route -- this schema only decides whether to even
 * attempt the RPC call.
 */
export const driveMediaIdSchema = z.uuid();

/**
 * The move-to-Drive actions' one argument (app/(contributor)/account/drive/
 * move-actions.ts). Only decides whether the id is worth sending to the
 * RPCs at all -- ownership and run state are checked by the database.
 */
export const driveMoveRunIdSchema = z.uuid();
