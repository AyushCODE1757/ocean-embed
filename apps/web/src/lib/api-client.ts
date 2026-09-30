/** API client — demo deployment binds directly to the simulator facade.
 * The type surface mirrors contracts/openapi so switching to the real
 * FastAPI service later is a one-file change (fetch instead of simApi). */

import { simApi, type Layer, type Grid, type Meta, type Profile, type Section } from "./sim";
import type { GapSite } from "./sim/gaps";
import type { Osse } from "./sim/osse";
import type { MetricRow, Basin, Season } from "./sim/metrics";
import type { Cyclone } from "./sim/cyclone";
import type { HeatMetric } from "./sim/derived";

export type { Layer, Grid, Meta, Profile, Section, GapSite, Osse, MetricRow, Cyclone, HeatMetric, Basin, Season };

export const api = {
  meta: () => simApi.meta(),
  slice: (date: string, depth: number, layer: Layer = "temp") => simApi.slice(date, depth, layer),
  profile: (date: string, lat: number, lon: number) => simApi.profile(date, lat, lon),
  section: (date: string, from: { lat: number; lon: number }, to: { lat: number; lon: number }) =>
    simApi.section(date, from, to),
  uncertainty: (date: string, depth: number) => simApi.slice(date, depth, "uncertainty"),
  gaps: (date: string, k = 10, onProgress?: (p: number) => void) => simApi.gaps(date, k, onProgress),
  osse: () => simApi.osse(),
  metrics: (basin?: Basin, season?: Season) => simApi.metrics(basin, season),
  heat: (date: string, metric: HeatMetric, lat?: number, lon?: number) => simApi.heat(date, metric, lat, lon),
  cyclone: (id?: string) => simApi.cyclone(id),
};
