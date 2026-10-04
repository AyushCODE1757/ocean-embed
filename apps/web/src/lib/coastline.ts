/* Natural Earth 50m land polygons (public domain, NOAA/NCEA) for crisp
   anti-aliased coastlines when rendering fields at high resolution.
   The 0.25° grid's own land mask is staircase-shaped at large render sizes,
   so vector geometry is used to clip the raster to the true ocean. */

export type Ring = number[][]; // [[lon, lat], ...]
let cache: Promise<Ring[]> | null = null;

export function landRings(): Promise<Ring[]> {
  if (!cache) {
    cache = fetch("/geo/ne_50m_land.json")
      .then((r) => r.json())
      .then((j: {
        features: {
          geometry: { type: string; coordinates: number[][][] | number[][][][] };
        }[];
      }) => {
        const rings: Ring[] = [];
        for (const f of j.features) {
          const g = f.geometry;
          if (g.type === "Polygon") {
            rings.push((g.coordinates as number[][][])[0]); // outer ring only
          } else if (g.type === "MultiPolygon") {
            for (const poly of g.coordinates as number[][][][]) rings.push(poly[0]);
          }
        }
        return rings;
      })
      .catch((e) => {
        cache = null; // allow retry on next call
        throw e;
      });
  }
  return cache;
}

/* Path that covers the whole image EXCEPT the land polygons (evenodd):
   filling it with destination-in keeps ocean pixels and cuts land. */
export function oceanClipPath(
  rings: Ring[],
  box: { lon0: number; lat0: number; lon1: number; lat1: number },
  outW: number,
  outH: number,
): Path2D {
  const p = new Path2D();
  p.rect(0, 0, outW, outH);
  const sx = outW / (box.lon1 - box.lon0);
  const sy = outH / (box.lat1 - box.lat0);
  for (const ring of rings) {
    // skip rings entirely outside the box (cheap bbox test)
    let minLon = 1e9, maxLon = -1e9, minLat = 1e9, maxLat = -1e9;
    for (const [lo, la] of ring) {
      if (lo < minLon) minLon = lo;
      if (lo > maxLon) maxLon = lo;
      if (la < minLat) minLat = la;
      if (la > maxLat) maxLat = la;
    }
    if (maxLon < box.lon0 || minLon > box.lon1 || maxLat < box.lat0 || minLat > box.lat1) continue;
    let started = false;
    for (const [lo, la] of ring) {
      const x = (lo - box.lon0) * sx;
      const y = (box.lat1 - la) * sy;
      if (started) p.lineTo(x, y);
      else { p.moveTo(x, y); started = true; }
    }
    p.closePath();
  }
  return p;
}
