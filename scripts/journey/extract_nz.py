"""Extract simplified NZ land, lakes and main roads from Natural Earth GeoJSON.

Usage: python3 -I extract_nz.py <data_dir> <out_ts>
Writes a TypeScript module with [lng, lat] rings/lines rounded to 3 dp.
Natural Earth data is public domain.
"""
import json
import math
import sys

MIN_LAT, MAX_LAT, MIN_LNG, MAX_LNG = -47.5, -34.0, 166.0, 178.9


def inside(p):
    return MIN_LNG <= p[0] <= MAX_LNG and MIN_LAT <= p[1] <= MAX_LAT


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


def main(data_dir, out_ts):
    land = []
    for f in load(f"{data_dir}/ne_10m_admin_0_map_subunits.geojson"):
        if f["properties"].get("ADM0_A3") != "NZL":
            continue
        for poly in polygons(f["geometry"]):
            outer = [p[:2] for p in poly[0]]
            if not all(inside(p) for p in outer) or ring_area(outer) < 0.02:
                continue  # drops Chathams, sub-Antarctic and tiny islets
            land.append({"name": f["properties"].get("NAME_EN") or f["properties"].get("SUBUNIT"),
                         "ring": rnd(simplify(outer, 0.02))})

    lakes = []
    for f in load(f"{data_dir}/ne_10m_lakes.geojson"):
        for poly in polygons(f["geometry"]):
            outer = [p[:2] for p in poly[0]]
            if all(inside(p) for p in outer) and ring_area(outer) > 0.004:
                lakes.append({"name": f["properties"].get("name"), "ring": rnd(simplify(outer, 0.01))})

    roads = []
    for f in load(f"{data_dir}/ne_10m_roads.geojson"):
        pr = f["properties"]
        if pr.get("sov_a3") != "NZL" and pr.get("continent") != "Oceania":
            continue
        if pr.get("type") not in ("Major Highway", "Secondary Highway"):
            continue
        for ln in lines(f["geometry"]):
            ln = [p[:2] for p in ln]
            if len(ln) >= 2 and all(inside(p) for p in ln):
                roads.append({"kind": "major" if pr["type"] == "Major Highway" else "secondary",
                              "line": rnd(simplify(ln, 0.015))})

    pts = sum(len(x["ring"]) for x in land + lakes) + sum(len(r["line"]) for r in roads)
    with open(out_ts, "w", encoding="utf-8") as out:
        out.write("// GENERATED from Natural Earth 1:10m data (public domain,\n"
                  "// https://www.naturalearthdata.com). Do not hand-edit.\n"
                  "// Coordinates are [longitude, latitude], simplified (Douglas-Peucker).\n\n")
        for name, val in (("NZ_LAND", land), ("NZ_LAKES", lakes), ("NZ_ROADS", roads)):
            out.write(f"export const {name} = {json.dumps(val, separators=(',', ':'))} as const;\n\n")
    print(f"land={len(land)} lakes={len(lakes)} roads={len(roads)} points={pts}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
