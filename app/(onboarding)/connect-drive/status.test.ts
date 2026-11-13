import { describe, expect, it } from "vitest";
import { parseConnectDriveStatus } from "./status";

describe("parseConnectDriveStatus", () => {
  it.each(["cancelled", "failed"] as const)("accepts %s", (status) => {
    expect(parseConnectDriveStatus(status)).toBe(status);
  });

  it("takes the first value when the param is repeated", () => {
    expect(parseConnectDriveStatus(["failed", "cancelled"])).toBe("failed");
  });

  it.each([undefined, "", "connected", "unavailable", "anything"])(
    "ignores %s, so the page can't be made to claim a connection",
    (value) => {
      expect(parseConnectDriveStatus(value)).toBeNull();
    },
  );
});
