import { describe, expect, it } from "vitest";
import { COST_EXPOSURE, OUTAGE_EXPOSURE, classifyComparison } from "../src/comparability.js";

describe("comparability", () => {
  it("is direct only when rule, source, window, unit, and side match", () => {
    expect(classifyComparison(OUTAGE_EXPOSURE, OUTAGE_EXPOSURE)).toBe("direct");
    expect(classifyComparison(OUTAGE_EXPOSURE, { ...OUTAGE_EXPOSURE, window: "2026-12-01T00:00:00.000Z" })).toBe("proxy");
    expect(classifyComparison(OUTAGE_EXPOSURE, { ...OUTAGE_EXPOSURE, resolutionSource: "https://example.invalid/other" })).toBe("proxy");
    expect(classifyComparison(OUTAGE_EXPOSURE, COST_EXPOSURE)).toBe("proxy");
  });

  it("never calls a weather contract a direct hedge for a cloud outage", () => {
    const weather = { ...OUTAGE_EXPOSURE, subject: "weather" as const };
    expect(classifyComparison(OUTAGE_EXPOSURE, weather)).toBe("not_comparable");
    expect(classifyComparison(OUTAGE_EXPOSURE, weather)).not.toBe("direct");
    expect(classifyComparison(weather, OUTAGE_EXPOSURE)).not.toBe("direct");
  });
});
