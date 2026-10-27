/*
 * Reduced presentation model based on factual Track B node names, cycle order,
 * and millimetre distances in the public CS452/652 Spring 2026 topology data.
 * SVG geometry and browser timing are original explanatory simulation data.
 */
window.CS452_TRACK_MODEL = Object.freeze({
  source: "https://student.cs.uwaterloo.ca/~cs452/S26/track/",
  track: "B",
  topologyFacts: Object.freeze({
    directionalSensorNodes: 80,
    physicalSensorPairs: 40,
    branchNodes: 22,
    mergeNodes: 22,
    numberedTurnouts: "1–18, 153–156",
    edgeDistanceUnit: "mm",
    trackMax: 144,
  }),
  /* Browser-simulation stop points. Each destination is anchored to a factual
   * Track B sensor position so the label, target marker, and stopping logic
   * all share one source of truth. */
  destinations: Object.freeze([
    Object.freeze({ id: "D1", routeId: "left-inner", mm: 239, anchorSensor: "E02", label: "Left inner · E02" }),
    Object.freeze({ id: "D2", routeId: "left-inner", mm: 806, anchorSensor: "C12", label: "Left inner · C12" }),
    Object.freeze({ id: "D3", routeId: "left-inner", mm: 1619, anchorSensor: "B16", label: "Left inner · B16" }),
    Object.freeze({ id: "D4", routeId: "left-inner", mm: 2362, anchorSensor: "B03", label: "Left inner · B03" }),
    Object.freeze({ id: "D5", routeId: "right-inner", mm: 239, anchorSensor: "B14", label: "Right inner · B14" }),
    Object.freeze({ id: "D6", routeId: "right-inner", mm: 729, anchorSensor: "E14", label: "Right inner · E14" }),
    Object.freeze({ id: "D7", routeId: "right-inner", mm: 1634, anchorSensor: "D05", label: "Right inner · D05" }),
    Object.freeze({ id: "D8", routeId: "right-inner", mm: 2205, anchorSensor: "E03", label: "Right inner · E03" }),
  ]),
  routes: Object.freeze([
    Object.freeze({
      id: "left-inner",
      pathId: "route-left-inner",
      label: "LEFT INNER",
      totalMm: 2809,
      sensors: Object.freeze([
        { forward: "E02", reverse: "E01", mm: 239 },
        { forward: "E15", reverse: "E16", mm: 440 },
        { forward: "C12", reverse: "C11", mm: 806 },
        { forward: "A04", reverse: "A03", mm: 1182 },
        { forward: "B16", reverse: "B15", mm: 1619 },
        { forward: "C10", reverse: "C09", mm: 1995 },
        { forward: "B03", reverse: "B04", mm: 2362 },
        { forward: "C02", reverse: "C01", mm: 2563 },
      ]),
    }),
    Object.freeze({
      id: "right-inner",
      pathId: "route-right-inner",
      label: "RIGHT INNER",
      totalMm: 2652,
      sensors: Object.freeze([
        { forward: "B14", reverse: "B13", mm: 239 },
        { forward: "D16", reverse: "D15", mm: 440 },
        { forward: "E14", reverse: "E13", mm: 729 },
        { forward: "E09", reverse: "E10", mm: 1011 },
        { forward: "D05", reverse: "D06", mm: 1634 },
        { forward: "E06", reverse: "E05", mm: 1916 },
        { forward: "E03", reverse: "E04", mm: 2205 },
        { forward: "D01", reverse: "D02", mm: 2406 },
      ]),
    }),
    Object.freeze({
      id: "outer",
      pathId: "route-outer",
      label: "MAIN CIRCUIT",
      totalMm: 4704,
      sensors: Object.freeze([
        { forward: "C13", reverse: "C14", mm: 50 },
        { forward: "E07", reverse: "E08", mm: 830 },
        { forward: "D07", reverse: "D08", mm: 1206 },
        { forward: "D09", reverse: "D10", mm: 1986 },
        { forward: "E12", reverse: "E11", mm: 2268 },
        { forward: "D11", reverse: "D12", mm: 2542 },
        { forward: "C16", reverse: "C15", mm: 2946 },
        { forward: "C06", reverse: "C05", mm: 3246 },
        { forward: "B15", reverse: "B16", mm: 3729 },
        { forward: "A03", reverse: "A04", mm: 4166 },
      ]),
    }),
  ]),
});
