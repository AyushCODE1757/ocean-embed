import { describe, expect, it } from "vitest";
import { parseView, serializeView } from "./url-state";

const fb = { date: "2024-01-01", depth: 0 };

describe("url state", () => {
  it("round-trips a full view", () => {
    const v = { date: "2024-03-05", depth: 100, lat: 15.25, lon: 88.5 };
    expect(parseView(new URLSearchParams(serializeView(v)), fb)).toEqual(v);
  });
  it("falls back on missing or bad params", () => {
    expect(parseView(new URLSearchParams("depth=abc"), fb).depth).toBe(0);
  });
});
