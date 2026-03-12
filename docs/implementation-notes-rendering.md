# Implementation notes: rendering puzzle pieces

Use **SVG + d3-geo** to render neighborhood puzzle pieces. This doc is the source of truth for the rendering approach; follow it together with the roadmap plan.

---

## Approach: SVG + d3-geo

- Use **d3.geoPath(projection)** to get an SVG path generator.
- For each GeoJSON feature, call `pathGenerator(feature)` – it returns an **SVG path string** (e.g. `"M10,20L30,40L50,60Z"`). If the return value is an object, use `.toString()` to get the string.
- Render each neighborhood as an SVG `<path d={pathString} />` inside a `<g>` (group). Position the `<g>` with `transform="translate(x, y)"` for drag offset.
- **City outline**: one or more `<path>` elements from the same projection (e.g. draw all features with a light stroke, or merge into one polygon), with a subtle stroke and no fill (or very light fill), behind the pieces.
- **Drag**: use `pointerdown` / `pointermove` / `pointerup` on each `<g>`. Update `translate(x, y)` during drag. No Y-flip needed – SVG and d3 projection both use y-down screen coordinates when you use `fitSize([width, height], data)`.
- **Hit detection**: built-in (the element under the pointer is the target). No point-in-polygon needed.
- **Drop shadow**: use an SVG `<filter>` with `feDropShadow` and reference it via `filter="url(#shadow)"` on the piece `<g>` or `<path>`.

Stack: React + d3-geo + SVG. No canvas or WebGL.

---

## Reverting from PixiJS

If the codebase currently uses PixiJS for the puzzle:

- **Remove** the PixiJS dependency and any component that uses `pixi.js` (e.g. a canvas-based `PuzzleCanvas`).
- **Replace** with an SVG-based puzzle component that:
  - Fetches the GeoJSON, builds a d3 projection with `fitSize([width, height], data)`, and uses `d3.geoPath(projection)` to get path strings.
  - Renders a single `<svg>` with a `viewBox` (e.g. `0 0 width height`) and responsive width/height (e.g. 100% or fixed aspect ratio).
  - Renders the city outline as one or more `<path>` elements, then one `<g>` per neighborhood, each containing a `<path d={pathString} />` and using `transform="translate(x,y)"` for position.
  - Implements drag by updating (x, y) state on pointer events and re-rendering.
- Keep the same **game logic** (snap tolerance, locked state, completion callback, randomization of initial positions) in React state; only the rendering layer changes from canvas/PixiJS to SVG.

---

## GeoJSON structure (this project)

- **Type**: `FeatureCollection` with `features[]`.
- **Geometry**: `Polygon` or **MultiPolygon**. For MultiPolygon, `coordinates` is `[ [ [ [lng, lat], ... ] ], ... ]` – multiple rings per feature. `d3.geoPath()` handles this and outputs one path string per feature (with multiple M…Z subpaths as needed). Use the path string directly in `<path d="...">`; no manual parsing required.

---

## Checklist for “pieces not rendering”

- [ ] Path string: are you getting a non-empty string from `pathGenerator(feature)` (or `.toString()` if it returns an object)?
- [ ] SVG in DOM: is the `<svg>` in the layout with a non-zero size (e.g. `viewBox` and `width`/`height` or CSS)?
- [ ] Coordinates: use `fitSize([width, height], data)` so projected coordinates are in [0, width] × [0, height]; no Y-flip needed for SVG.
- [ ] One `<g>` per piece: each piece’s `<path>` should be inside a `<g>` so you can set `transform="translate(x,y)"` for drag and keep hit detection on the path or group.
