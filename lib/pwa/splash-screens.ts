import config from "./splash-devices.json";

export type SplashDevice = {
  name: string;
  width: number;
  height: number;
  ratio: number;
};

/** Side of the centred icon tile, in CSS points -- shared with the in-app splash. */
export const SPLASH_ICON_SIZE: number = config.iconSize;

/** The generated file for a device and colour scheme (scripts/generate-splash-screens.mjs). */
export function splashImagePath(
  device: SplashDevice,
  scheme: "light" | "dark",
): string {
  return `/splash/${device.width * device.ratio}x${device.height * device.ratio}-${scheme}.png`;
}

/**
 * The launch images iOS shows while a home-screen Kakinotes starts, before
 * the page itself has painted (`apple-touch-startup-image`). iOS picks the
 * one whose media query matches the screen exactly, so there is one per
 * iPhone size, portrait, each in the reader's system colour scheme. Without
 * a match iOS shows a blank screen -- which is what this replaces.
 */
export function appleStartupImages(): { url: string; media: string }[] {
  return (config.devices as SplashDevice[]).flatMap((device) =>
    (["dark", "light"] as const).map((scheme) => ({
      url: splashImagePath(device, scheme),
      media:
        `screen and (device-width: ${device.width}px) and (device-height: ${device.height}px)` +
        ` and (-webkit-device-pixel-ratio: ${device.ratio}) and (orientation: portrait)` +
        ` and (prefers-color-scheme: ${scheme})`,
    })),
  );
}
