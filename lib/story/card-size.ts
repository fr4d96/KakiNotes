/**
 * The card size on the Stories tab and the home pages' latest stories, chosen by the reader and remembered on this
 * device (a cookie, like the language and country choices -- so the server
 * draws the right size on the first paint, with no flash of the other one).
 * A display preference only; it never changes what a query may return.
 *
 * "big": one wide card per row on a phone, with the excerpt and author --
 * for reading before you tap. "small": two compact cards per row on a phone
 * -- photo, title, place -- for scanning many stories without scrolling.
 */
export const CARD_SIZES = ["big", "small"] as const;
export type CardSize = (typeof CARD_SIZES)[number];

// Owner decision 2026-11-16: small cards unless the reader picks big.
export const DEFAULT_CARD_SIZE: CardSize = "small";

export const CARD_SIZE_COOKIE = "kakinotes-card-size";
export const CARD_SIZE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** A cookie value -> a card size; anything else is the default. */
export function cardSizeFromCookieValue(
  value: string | null | undefined,
): CardSize {
  return (CARD_SIZES as readonly string[]).includes(value ?? "")
    ? (value as CardSize)
    : DEFAULT_CARD_SIZE;
}

/** Remembers the choice on this device. Browser only (a click handler). */
export function saveCardSize(size: CardSize) {
  document.cookie = `${CARD_SIZE_COOKIE}=${size}; path=/; max-age=${CARD_SIZE_COOKIE_MAX_AGE}; samesite=lax`;
}
