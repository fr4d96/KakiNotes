import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveGoogleMapsLink } from "./resolve-google-maps-link";

const PLACE =
  "https://www.google.com/maps/place/W%C4%81naka/@-44.7,169.13,12z/data=!8m2!3d-44.7032!4d169.1321";

function redirect(location: string, status = 302) {
  return new Response(null, { status, headers: { location } });
}

function stubFetch(...responses: Array<Response | unknown>) {
  const fn = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra fetch");
    if (!(next instanceof Response)) throw next;
    return next;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("resolveGoogleMapsLink", () => {
  it("parses a full link without any network request", async () => {
    const fetchFn = stubFetch();
    expect(await resolveGoogleMapsLink(PLACE)).toEqual({
      ok: true,
      latitude: -44.7032,
      longitude: 169.1321,
      placeName: "Wānaka",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("follows a short link's redirect chain, reading only Location", async () => {
    const fetchFn = stubFetch(
      redirect("https://goo.gl/maps/abc"),
      redirect(
        "https://consent.google.com/x".replace("consent.", "www.") + "?y=1",
      ),
      redirect(PLACE),
    );
    const result = await resolveGoogleMapsLink(
      "https://maps.app.goo.gl/AbC123",
    );
    expect(result).toMatchObject({ ok: true, placeName: "Wānaka" });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.redirect).toBe("manual");
    expect(init.method).toBe("GET");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("resolves a relative Location against the current URL", async () => {
    const fetchFn = stubFetch(redirect("/maps/second"), redirect(PLACE));
    expect(
      await resolveGoogleMapsLink("https://goo.gl/maps/first"),
    ).toMatchObject({ ok: true, placeName: "Wānaka" });
    expect((fetchFn.mock.calls[1] as unknown[])[0]).toBe(
      "https://goo.gl/maps/second",
    );
  });

  it("rejects a redirect to a foreign host without fetching it", async () => {
    for (const target of [
      "https://evil.example/maps/@-44,170,9z",
      "http://www.google.com/maps/@-44,170,9z",
      "https://169.254.169.254/latest/meta-data",
      "https://www.google.com:8443/maps/x",
      "https://user:pw@www.google.com/maps/x",
      "https://google.com.evil.example/maps",
    ]) {
      const fetchFn = stubFetch(redirect(target));
      expect(await resolveGoogleMapsLink("https://maps.app.goo.gl/a")).toEqual({
        ok: false,
        reason: "invalid",
      });
      expect(fetchFn).toHaveBeenCalledTimes(1);
    }
  });

  it("gives up after 3 redirects", async () => {
    const fetchFn = stubFetch(
      redirect("https://goo.gl/maps/1"),
      redirect("https://goo.gl/maps/2"),
      redirect("https://goo.gl/maps/3"),
      redirect("https://goo.gl/maps/4"),
    );
    expect(await resolveGoogleMapsLink("https://maps.app.goo.gl/a")).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("reports unreachable on timeout or network failure", async () => {
    stubFetch(new DOMException("timed out", "TimeoutError"));
    expect(await resolveGoogleMapsLink("https://maps.app.goo.gl/a")).toEqual({
      ok: false,
      reason: "unreachable",
    });
  });

  it("reports not_found for a non-redirect response or a link without coordinates", async () => {
    stubFetch(new Response("<html>", { status: 200 }));
    expect(await resolveGoogleMapsLink("https://maps.app.goo.gl/a")).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(
      await resolveGoogleMapsLink("https://www.google.com/maps/place/Nowhere"),
    ).toEqual({ ok: false, reason: "not_found" });
  });

  it("rejects points outside New Zealand", async () => {
    expect(
      await resolveGoogleMapsLink("https://www.google.com/maps/@51.5,-0.12,9z"),
    ).toEqual({ ok: false, reason: "outside_nz" });
  });

  it("never fetches unrelated or malformed input", async () => {
    const fetchFn = stubFetch();
    for (const input of [
      "https://evil.example/x",
      "https://goo.gl/other",
      "https://goo.gl.evil.example/maps/a",
      "http://maps.app.goo.gl/a",
      "https://maps.app.goo.gl:444/a",
      "nonsense",
      "https://maps.app.goo.gl/" + "a".repeat(2100),
    ]) {
      expect(await resolveGoogleMapsLink(input)).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
