import { describe, expect, it } from "vitest";
import { mustConnectDrive } from "./drive-binding-guard";

describe("mustConnectDrive", () => {
  it("requires an ordinary contributor with no connection to connect", () => {
    expect(
      mustConnectDrive({
        role: "user",
        driveConfigured: true,
        driveConnected: false,
      }),
    ).toBe(true);
  });

  it("treats a missing role row as an ordinary contributor (fails closed)", () => {
    expect(
      mustConnectDrive({
        role: null,
        driveConfigured: true,
        driveConnected: false,
      }),
    ).toBe(true);
  });

  it("lets a connected contributor through", () => {
    expect(
      mustConnectDrive({
        role: "user",
        driveConfigured: true,
        driveConnected: true,
      }),
    ).toBe(false);
  });

  it.each(["editor", "moderator", "admin"] as const)(
    "never requires %s to connect",
    (role) => {
      expect(
        mustConnectDrive({
          role,
          driveConfigured: true,
          driveConnected: false,
        }),
      ).toBe(false);
    },
  );

  it("never requires anyone to connect when Drive isn't configured here", () => {
    expect(
      mustConnectDrive({
        role: "user",
        driveConfigured: false,
        driveConnected: false,
      }),
    ).toBe(false);
  });
});
