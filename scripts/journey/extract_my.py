"""Extract simplified Malaysia land, lakes and main roads from Natural Earth GeoJSON.

Usage: python3 -I extract_my.py <data_dir> <out_ts>
Writes a TypeScript module with [lng, lat] rings/lines rounded to 3 dp.
Natural Earth data is public domain.

Malaysia is drawn as an inset (two panels: Peninsular and Borneo), so every
feature is clipped to the two panel rectangles. Malaysia, Singapore and Brunei
are named for their land mass; neighbouring land (Thailand, Indonesia) is
included, clipped to the panels, so the coastlines read as real islands.
"""
import json
import math
import sys

# Must match PANELS in lib/journey/geographies.ts and the database bounds.
PANELS = [(99.5, 104.8, 0.8, 7.5), (109.4, 119.5, 0.8, 7.5)]
PENINSULAR_MAX_LNG = 107.0


def panel_of(p):
    for i, (x0, x1, y0, y1) in enumerate(PANELS):
        if x0 <= p[0] <= x1 and y0 <= p[1] <= y1:
            return i
    return None


def perp(p, a, b):
    if a == b:
        return math.dist(p, a)
    (x, y), (x1, y1), (x2, y2) = p, a, b
    return abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / math.dist(a, b)


def simplify(pts, tol):
    """Iterative Douglas-Peucker."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        s, e = stack.pop()
        best, idx = 0.0, None
        for i in range(s + 1, e):
            d = perp(pts[i], pts[s], pts[e])
            if d > best:
                best, idx = d, i
        if idx is not None and best > tol:
            keep[idx] = True
            stack += [(s, idx), (idx, e)]
    return [p for p, k in zip(pts, keep) if k]


def rnd(pts):
    return [[round(x, 3), round(y, 3)] for x, y in pts]


def clip_ring(ring, box):
    """Sutherland-Hodgman clip of a polygon ring to a rectangle."""
    x0, x1, y0, y1 = box
    edges = [
        (lambda p: p[0] >= x0, lambda a, b: (x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0]))),
        (lambda p: p[0] <= x1, lambda a, b: (x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0]))),
        (lambda p: p[1] >= y0, lambda a, b: (a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0)),
        (lambda p: p[1] <= y1, lambda a, b: (a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1)),
    ]
    out = [tuple(p) for p in ring]
    for ins, cut in edges:
        if not out:
            break
        src, out = out, []
        for i, cur in enumerate(src):
            prev = src[i - 1]
            if ins(cur):
                if not ins(prev):
                    out.append(cut(prev, cur))
                out.append(cur)
            elif ins(prev):
                out.append(cut(prev, cur))
    return out


def polygons(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def lines(geom):
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        return geom["coordinates"]
    return []


def ring_area(r):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(r, r[1:] + r[:1]))) / 2


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)["features"]


def runs_inside(ln, box_i):
    """Split a line into maximal runs of points inside panel `box_i`."""
    runs, cur = [], []
    for p in ln:
        if panel_of(p) == box_i:
            cur.append(p)
        else:
            if len(cur) >= 2:
                runs.append(cur)
            cur = []
    if len(cur) >= 2:
        runs.append(cur)
    return runs


def main(data_dir, out_ts):
    names = {"MYS": None, "SGP": "Singapore", "BRN": "Brunei", "THA": "Thailand", "IDN": "Indonesia"}
    land = []
    for f in load(f"{data_dir}/ne_10m_admin_0_map_subunits.geojson"):
        a3 = f["properties"].get("ADM0_A3")
        if a3 not in names:
            continue
        for poly in polygons(f["geometry"]):
            outer = [p[:2] for p in poly[0]]
            for i, (x0, x1, y0, y1) in enumerate(PANELS):
                clipped = clip_ring(outer, (x0, x1, y0, y1))
                if len(clipped) < 3 or ring_area(clipped) < 0.01:
                    continue  # drops specks and anything outside the panels
                name = names[a3]
                if a3 == "MYS":
                    cx = sum(p[0] for p in clipped) / len(clipped)
                    name = "Peninsular Malaysia" if cx < PENINSULAR_MAX_LNG else "Sabah and Sarawak"
                land.append({"name": name, "ring": rnd(simplify(clipped, 0.012))})

    lakes = []
    for f in load(f"{data_dir}/ne_10m_lakes.geojson"):
        for poly in polygons(f["geometry"]):
            outer = [p[:2] for p in poly[0]]
            if all(panel_of(p) is not None for p in outer) and ring_area(outer) > 0.004:
                lakes.append({"name": f["properties"].get("name"), "ring": rnd(simplify(outer, 0.01))})

    roads = []
    for f in load(f"{data_dir}/ne_10m_roads.geojson"):
        pr = f["properties"]
        if pr.get("type") not in ("Major Highway", "Road"):
            continue
        kind = "major" if pr["type"] == "Major Highway" else "secondary"
        for ln in lines(f["geometry"]):
            ln = [p[:2] for p in ln]
            for i in range(len(PANELS)):
                for run in runs_inside(ln, i):
                    roads.append({"kind": kind, "line": rnd(simplify(run, 0.015))})

    pts = sum(len(x["ring"]) for x in land + lakes) + sum(len(r["line"]) for r in roads)
    with open(out_ts, "w", encoding="utf-8") as out:
        out.write("// GENERATED from Natural Earth 1:10m data (public domain,\n"
                  "// https://www.naturalearthdata.com). Do not hand-edit.\n"
                  "// Coordinates are [longitude, latitude], simplified (Douglas-Peucker),\n"
                  "// clipped to the two Malaysia panels (see lib/journey/geographies.ts).\n\n")
        for name, val in (("MY_LAND", land), ("MY_LAKES", lakes), ("MY_ROADS", roads)):
            out.write(f"export const {name} = {json.dumps(val, separators=(',', ':'))} as const;\n\n")
    print(f"land={len(land)} lakes={len(lakes)} roads={len(roads)} points={pts}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
