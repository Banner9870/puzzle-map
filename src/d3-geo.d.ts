declare module 'd3-geo' {
  export interface GeoProjection {
    (coordinates: [number, number]): [number, number] | null
    invert?(point: [number, number]): [number, number] | null
    clipExtent(extent: [[number, number], [number, number]] | null): this
    clipExtent(): [[number, number], [number, number]] | null
    parallels(values: [number, number]): this
    rotate(angles: [number, number] | [number, number, number]): this
    fitSize(size: [number, number], object: unknown): this
  }

  export interface GeoPathObject {
    (object: unknown): string | null
    bounds(object: unknown): [[number, number], [number, number]]
  }

  export function geoPath(projection?: GeoProjection | null): GeoPathObject
  export function geoConicConformal(): GeoProjection
}
