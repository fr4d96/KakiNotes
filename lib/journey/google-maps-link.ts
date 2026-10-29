/**
 * Pure parsing of a Google Maps link into a place's coordinates and name.
 * No network, no storage: the link itself is never kept anywhere, only the
 * latitude/longitude (rounded later, server-side) and the name.
 *
 * Short links (maps.app.goo.gl/..., goo.gl/maps/...) carry no coordinates;
 * they are resolved server-side by lib/journey/resolve-google-maps-link.ts.
 */

export type ParsedGoogleMapsPlace = {
  latitude: number;
  longitude: number;
  placeName: string | null;
};

// google.<tld>, www.google.<tld>, maps.google.<tld>: .com, .co.nz, .com.my,
// .de ... Exact match only, so "google.com.evil.example" and
// "notgoogle.com" are rejected.
const GOOGLE_HOST =
  /^(?:www\.|maps\.)?google\.(?:[a-z]{2,3}|(?:com|co)\.[a-z]{2})$/;

const NUM = "-?\\d+(?:\\.\\d+)?";
const PLACE_PIN = new RegExp(`!3d(${NUM})!4d(${NUM})`);
const VIEWPORT = new RegExp(`/@(${NUM}),(${NUM})(?:[,/]|$)`);
const COORDINATE_PAIR = new RegExp(`^\\s*(${NUM})\\s*,\\s*(${NUM})\\s*$`);

export function isGoogleHost(hostname: string): boolean {
  return GOOGLE_HOST.test(hostname);
}

/** https only, no credentials, no explicit port. */
export function hasPlainHttpsOrigin(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === ""
  );
}

export function isGoogleMapsUrl(url: URL): boolean {
  return (
    hasPlainHttpsOrigin(url) &&
    isGoogleHost(url.hostname) &&
    (url.pathname === "/maps" || url.pathname.startsWith("/maps/"))
  );
}

function toCoordinates(
  lat: string,
  lng: string,
): { latitude: number; longitude: number } | null {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return null;
  }
}

function cleanName(raw: string | null): string | null {
  if (raw === null) return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (name === "" || COORDINATE_PAIR.test(name)) return null;
  return name;
}

function placeNameFromPath(pathname: string): string | null {
  const match = /^\/maps\/place\/([^/]+)/.exec(pathname);
  return match ? cleanName(safeDecode(match[1])) : null;
}

export function parseGoogleMapsUrl(
  input: string,
): ParsedGoogleMapsPlace | null {
  if (typeof input !== "string") return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (!isGoogleMapsUrl(url)) return null;

  const path = safeDecode(url.pathname.replace(/\+/g, "%2B")) ?? url.pathname;
  let coords: { latitude: number; longitude: number } | null = null;

  // 1. The place's own pin (what the link is about). The @lat,lng centre is
  //    just where the map happened to be looking, and often differs.
  const pin = PLACE_PIN.exec(path);
  if (pin) coords = toCoordinates(pin[1], pin[2]);

  // 2. api=1 style query parameters.
  let queryName: string | null = null;
  for (const key of ["q", "query", "ll", "destination"]) {
    const value = url.searchParams.get(key);
    if (value === null) continue;
    const pair = COORDINATE_PAIR.exec(value);
    if (pair) {
      coords ??= toCoordinates(pair[1], pair[2]);
    } else if ((key === "q" || key === "query") && queryName === null) {
      queryName = cleanName(value);
    }
  }

  // 3. Viewport centre, last resort.
  if (!coords) {
    const view = VIEWPORT.exec(path);
    if (view) coords = toCoordinates(view[1], view[2]);
  }

  if (!coords) return null;
  return { ...coords, placeName: placeNameFromPath(url.pathname) ?? queryName };
}
