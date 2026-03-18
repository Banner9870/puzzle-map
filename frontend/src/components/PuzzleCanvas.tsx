/**
 * Puzzle map: loads Chicago neighborhoods GeoJSON, projects with d3-geo, renders one draggable piece per neighborhood,
 * snaps when within SNAP_TOLERANCE, persists locked state via persistence. Does not render page chrome or completion modal (App does).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { geoConicConformal, geoPath, type GeoProjection } from 'd3-geo'
import { copy } from '../content'
import {
  loadPuzzleState,
  savePuzzleState,
  type PuzzleState,
} from '../persistence'

/* GeoJSON and runtime piece state types; props include callbacks and optional force signals from App. */
type NeighborhoodFeature = {
  type: 'Feature'
  id?: string | number
  properties: {
    name?: string
    [key: string]: unknown
  }
  geometry: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: number[][][] | number[][][][]
  }
}

type NeighborhoodCollection = {
  type: 'FeatureCollection'
  features: NeighborhoodFeature[]
}

type PieceState = {
  id: string
  name: string
  pathString: string
  targetCenterX: number
  targetCenterY: number
  currentCenterX: number
  currentCenterY: number
  isLocked: boolean
  minX: number
  minY: number
  maxX: number
  maxY: number
}

type PuzzleCanvasProps = {
  onNeighborhoodTap?: (name: string) => void
  onCompleted?: () => void
  visitorId?: string | null
  onPuzzleStarted?: () => void
  onMove?: () => void
  /** Notify parent when a drag becomes active/inactive (used to pause bottom-sheet reflow). */
  onDragActiveChange?: (active: boolean) => void
  forceCompleteSignal?: number
  /** Increment to re-scatter all unlocked pieces (e.g. after resize or to shuffle). */
  forceShuffleSignal?: number
  /** Increment to clear progress and re-scatter all pieces. */
  forceClearSignal?: number
}

/* Snap distance (SVG units) and scatter layout tuning; increase SNAP_TOLERANCE to make snapping easier. */
const SNAP_TOLERANCE = 24
const SCATTER_MARGIN = 16
const SCATTER_GAP = 24

/* Picks a random position in bands around the city bounds so pieces don't overlap the outline; optional avoidRegions used to avoid overlapping already locked pieces. */
function getScatterPosition(
  piece: {
    minX: number
    maxX: number
    minY: number
    maxY: number
    targetCenterX: number
    targetCenterY: number
  },
  cityBounds: { minX: number; minY: number; maxX: number; maxY: number },
  width: number,
  height: number,
  avoidRegions?: { minX: number; minY: number; maxX: number; maxY: number }[],
): { x: number; y: number } {
  const halfW = (piece.maxX - piece.minX) / 2
  const halfH = (piece.maxY - piece.minY) / 2
  const { minX: cityLeft, maxX: cityRight, minY: cityTop, maxY: cityBottom } =
    cityBounds

  const pieceBoundsAt = (cx: number, cy: number) => ({
    minX: cx + piece.minX - piece.targetCenterX,
    minY: cy + piece.minY - piece.targetCenterY,
    maxX: cx + piece.maxX - piece.targetCenterX,
    maxY: cy + piece.maxY - piece.targetCenterY,
  })

  const overlapsAny = (cx: number, cy: number) => {
    if (!avoidRegions?.length) return false
    const b = pieceBoundsAt(cx, cy)
    return avoidRegions.some(
      (a) =>
        !(b.maxX < a.minX || b.minX > a.maxX || b.maxY < a.minY || b.minY > a.maxY),
    )
  }

  const positions: { x: number; y: number }[] = []

  const topMinY = SCATTER_MARGIN + halfH
  const topMaxY = cityTop - SCATTER_GAP - halfH
  if (topMaxY > topMinY) {
    positions.push({
      x:
        SCATTER_MARGIN +
        halfW +
        Math.random() * Math.max(0, width - 2 * (SCATTER_MARGIN + halfW)),
      y: topMinY + Math.random() * (topMaxY - topMinY),
    })
  }
  const bottomMaxY = height - SCATTER_MARGIN - halfH
  const bottomMinY = cityBottom + SCATTER_GAP + halfH
  if (bottomMaxY > bottomMinY) {
    positions.push({
      x:
        SCATTER_MARGIN +
        halfW +
        Math.random() * Math.max(0, width - 2 * (SCATTER_MARGIN + halfW)),
      y: bottomMinY + Math.random() * (bottomMaxY - bottomMinY),
    })
  }
  const leftMinX = SCATTER_MARGIN + halfW
  const leftMaxX = cityLeft - SCATTER_GAP - halfW
  if (leftMaxX > leftMinX) {
    positions.push({
      x: leftMinX + Math.random() * (leftMaxX - leftMinX),
      y:
        SCATTER_MARGIN +
        halfH +
        Math.random() *
          Math.max(0, height - 2 * (SCATTER_MARGIN + halfH)),
    })
  }
  const rightMaxX = width - SCATTER_MARGIN - halfW
  const rightMinX = cityRight + SCATTER_GAP + halfW
  if (rightMaxX > rightMinX) {
    positions.push({
      x: rightMinX + Math.random() * (rightMaxX - rightMinX),
      y:
        SCATTER_MARGIN +
        halfH +
        Math.random() *
          Math.max(0, height - 2 * (SCATTER_MARGIN + halfH)),
    })
  }

  const nonOverlapping =
    avoidRegions?.length && positions.length > 0
      ? positions.filter((pos) => !overlapsAny(pos.x, pos.y))
      : positions

  let x: number
  let y: number
  const pool = nonOverlapping.length > 0 ? nonOverlapping : positions
  if (pool.length > 0) {
    const choice = pool[Math.floor(Math.random() * pool.length)]
    x = choice.x
    y = choice.y
  } else {
    x =
      SCATTER_MARGIN +
      halfW +
      Math.random() * Math.max(0, width - 2 * (SCATTER_MARGIN + halfW))
    y =
      SCATTER_MARGIN +
      halfH +
      Math.random() * Math.max(0, height - 2 * (SCATTER_MARGIN + halfH))
  }

  const dx = x - piece.targetCenterX
  const dy = y - piece.targetCenterY
  const dxClamp = Math.max(
    -piece.minX,
    Math.min(width - piece.maxX, dx),
  )
  const dyClamp = Math.max(
    -piece.minY,
    Math.min(height - piece.maxY, dy),
  )
  return {
    x: piece.targetCenterX + dxClamp,
    y: piece.targetCenterY + dyClamp,
  }
}

/* d3-geo conic conformal projection fitted to the canvas; rotate/fitSize control how Chicago is centered and scaled. */
function buildProjection(
  width: number,
  height: number,
  data: NeighborhoodCollection,
): GeoProjection {
  const projection = geoConicConformal()
    .parallels([33, 45])
    .rotate([88, 0])
    .fitSize([width, height], data as unknown)
  projection.clipExtent([
    [0, 0],
    [width, height],
  ])
  return projection
}

/* Turns a GeoJSON feature into an SVG path string via d3 geoPath; handles null and non-string return values. */
function getPathString(
  pathGenerator: ReturnType<typeof geoPath>,
  feature: NeighborhoodFeature,
): string {
  const path = pathGenerator(feature)
  if (path == null) return ''
  return typeof path === 'string'
    ? path
    : (path as { toString?: () => string }).toString?.() ?? ''
}

export function PuzzleCanvas({
  onNeighborhoodTap,
  onCompleted,
  visitorId,
  onPuzzleStarted,
  onMove,
  forceCompleteSignal,
  forceShuffleSignal = 0,
  forceClearSignal = 0,
}: PuzzleCanvasProps) {
  /* State: dimensions (from ResizeObserver), pieces (from GeoJSON + persistence), drag state, unlockedOrder (for draw order and tap-to-cycle). */
  const containerRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 })
  const [pieces, setPieces] = useState<PieceState[]>([])
  const [outlinePath, setOutlinePath] = useState<string>('')
  const [isReady, setIsReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draggingPieceId, setDraggingPieceId] = useState<string | null>(null)
  const [isDragMoving, setIsDragMoving] = useState(false)
  const [snappedPieceId, setSnappedPieceId] = useState<string | null>(null)
  /** Back-to-front order of unlocked piece ids; used for draw order and tap-to-cycle. */
  const [unlockedOrder, setUnlockedOrder] = useState<string[]>([])
  const dragStartedRef = useRef(false)
  const hasReportedPuzzleStartedRef = useRef(false)
  const piecesRef = useRef<PieceState[]>([])
  piecesRef.current = pieces

  /**
   * Drag perf: keep per-frame pointer movement out of React state.
   * We update the active piece's CSS translate vars in rAF, and only commit the final position to React on pointer up.
   */
  const draggingPieceIdRef = useRef<string | null>(null)
  const draggingPointerIdRef = useRef<number | null>(null)
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const dragCenterRef = useRef<{ x: number; y: number } | null>(null)
  const rafPendingRef = useRef(false)
  const pieceElByIdRef = useRef(new Map<string, SVGGElement>())

  const setPieceEl = useCallback((id: string, el: SVGGElement | null) => {
    const map = pieceElByIdRef.current
    if (!el) {
      map.delete(id)
      return
    }
    map.set(id, el)
  }, [])

  const applyDragCssVars = useCallback(() => {
    rafPendingRef.current = false
    const id = draggingPieceIdRef.current
    const center = dragCenterRef.current
    if (!id || !center) return
    const piece = piecesRef.current.find((p) => p.id === id)
    if (!piece) return
    const dx = center.x - piece.targetCenterX
    const dy = center.y - piece.targetCenterY
    const el = pieceElByIdRef.current.get(id)
    if (!el) return
    el.style.setProperty('--piece-dx', `${dx}px`)
    el.style.setProperty('--piece-dy', `${dy}px`)
  }, [])

  const requestApplyDragCssVars = useCallback(() => {
    if (rafPendingRef.current) return
    rafPendingRef.current = true
    requestAnimationFrame(applyDragCssVars)
  }, [applyDragCssVars])

  /* Supports both new format (lockedPieceIds) and legacy (placedPieces with isLocked). */
  const applyStoredState = useCallback(
    (basePieces: PieceState[], stored: PuzzleState | null): PieceState[] => {
      if (!stored) return basePieces
      // New format: only locked piece ids.
      // Legacy format: derive from `placedPieces` but only treat a piece as locked
      // when the stored entry explicitly says `isLocked === true`.
      // This avoids legacy objects that omit `isLocked` (treated as unlocked).
      const lockedIds = new Set<string>(
        stored.lockedPieceIds ??
          (stored.placedPieces ?? [])
            .filter((p) => p.isLocked === true)
            .map((p) => p.id),
      )
      return basePieces.map((piece) => {
        if (!lockedIds.has(piece.id)) return piece
        return {
          ...piece,
          currentCenterX: piece.targetCenterX,
          currentCenterY: piece.targetCenterY,
          isLocked: true,
        }
      })
    },
    [],
  )

  /* Updates dimensions when the container size changes; GeoJSON load effect depends on dimensions. */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const updateSize = () => {
      if (container) {
        const width = Math.max(container.clientWidth, 1)
        const height = Math.max(container.clientHeight, 1)
        setDimensions((prev) =>
          prev.width !== width || prev.height !== height
            ? { width, height }
            : prev,
        )
      }
    }
    updateSize()
    const ro = new ResizeObserver(updateSize)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  /* Fetches neighborhoods, builds projection and paths, builds initial piece state, applies stored locked state, then re-scatters unlocked pieces (avoiding locked bboxes). */
  useEffect(() => {
    const { width, height } = dimensions
    if (width <= 1 && height <= 1) return

    let cancelled = false

    const load = async () => {
      setLoadError(null)
      try {
        const response = await fetch('/chicago_neighborhoods.geojson')
        if (!response.ok) {
          throw new Error('Failed to load neighborhood data')
        }
        const data = (await response.json()) as NeighborhoodCollection
        if (cancelled) return

        const projection = buildProjection(width, height, data)
        const pathGenerator = geoPath(projection)

        const featureData: {
          feature: NeighborhoodFeature
          id: string
          name: string
          pathStr: string
          bounds: [[number, number], [number, number]]
        }[] = []

        let cityMinX = Infinity
        let cityMinY = Infinity
        let cityMaxX = -Infinity
        let cityMaxY = -Infinity

        const outlineParts: string[] = []
        for (let index = 0; index < data.features.length; index++) {
          const feature = data.features[index]
          const props = feature.properties ?? {}
          const primaryName =
            (props.pri_neigh as string) ??
            (props.PRI_NEIGH as string) ??
            (props.name as string)
          const name = primaryName || `Neighborhood ${index + 1}`
          const id = String(feature.id ?? index)
          const pathStr = getPathString(pathGenerator, feature)
          if (!pathStr) continue

          const bounds = pathGenerator.bounds(feature)
          const [[minX, minY], [maxX, maxY]] = bounds
          cityMinX = Math.min(cityMinX, minX)
          cityMinY = Math.min(cityMinY, minY)
          cityMaxX = Math.max(cityMaxX, maxX)
          cityMaxY = Math.max(cityMaxY, maxY)

          outlineParts.push(pathStr)

          featureData.push({
            feature,
            id,
            name,
            pathStr,
            bounds,
          })
        }

        setOutlinePath(outlineParts.join(' '))

        let piecesState: PieceState[] = []
        for (const entry of featureData) {
          const { id, name, pathStr, bounds } = entry
          const [[minX, minY], [maxX, maxY]] = bounds
          const targetCenterX = (minX + maxX) / 2
          const targetCenterY = (minY + maxY) / 2

          const pieceWidth = maxX - minX
          const pieceHeight = maxY - minY
          const margin = SCATTER_MARGIN
          const gap = SCATTER_GAP
          const halfW = pieceWidth / 2
          const halfH = pieceHeight / 2

          const cityLeft = cityMinX
          const cityRight = cityMaxX
          const cityTop = cityMinY
          const cityBottom = cityMaxY

          const positions: { x: number; y: number }[] = []

          // Top band
          const topMinY = margin + halfH
          const topMaxY = cityTop - gap - halfH
          if (topMaxY > topMinY) {
            positions.push({
              x:
                margin +
                halfW +
                Math.random() * Math.max(0, width - 2 * (margin + halfW)),
              y: topMinY + Math.random() * (topMaxY - topMinY),
            })
          }

          // Bottom band
          const bottomMaxY = height - margin - halfH
          const bottomMinY = cityBottom + gap + halfH
          if (bottomMaxY > bottomMinY) {
            positions.push({
              x:
                margin +
                halfW +
                Math.random() * Math.max(0, width - 2 * (margin + halfW)),
              y: bottomMinY + Math.random() * (bottomMaxY - bottomMinY),
            })
          }

          // Left band
          const leftMinX = margin + halfW
          const leftMaxX = cityLeft - gap - halfW
          if (leftMaxX > leftMinX) {
            positions.push({
              x: leftMinX + Math.random() * (leftMaxX - leftMinX),
              y:
                margin +
                halfH +
                Math.random() *
                  Math.max(0, height - 2 * (margin + halfH)),
            })
          }

          // Right band
          const rightMaxX = width - margin - halfW
          const rightMinX = cityRight + gap + halfW
          if (rightMaxX > rightMinX) {
            positions.push({
              x: rightMinX + Math.random() * (rightMaxX - rightMinX),
              y:
                margin +
                halfH +
                Math.random() *
                  Math.max(0, height - 2 * (margin + halfH)),
            })
          }

          let currentCenterX = targetCenterX
          let currentCenterY = targetCenterY
          if (positions.length > 0) {
            const choice = positions[Math.floor(Math.random() * positions.length)]
            currentCenterX = choice.x
            currentCenterY = choice.y
          } else {
            // Fallback: keep within viewport with a simple scatter
            currentCenterX =
              margin +
              halfW +
              Math.random() * Math.max(0, width - 2 * (margin + halfW))
            currentCenterY =
              margin +
              halfH +
              Math.random() * Math.max(0, height - 2 * (margin + halfH))
          }

          // Clamp so piece stays fully in bounds (avoids out-of-frame on mobile)
          const dx = currentCenterX - targetCenterX
          const dy = currentCenterY - targetCenterY
          const dxClamp = Math.max(
            -minX,
            Math.min(width - maxX, dx),
          )
          const dyClamp = Math.max(
            -minY,
            Math.min(height - maxY, dy),
          )
          currentCenterX = targetCenterX + dxClamp
          currentCenterY = targetCenterY + dyClamp

          piecesState.push({
            id,
            name,
            pathString: pathStr,
            targetCenterX,
            targetCenterY,
            currentCenterX,
            currentCenterY,
            isLocked: false,
            minX,
            minY,
            maxX,
            maxY,
          })
        }
        if (visitorId) {
          const stored = loadPuzzleState(visitorId)
          piecesState = applyStoredState(piecesState, stored)
        }

        // Re-scatter unlocked pieces to avoid overlapping snapped (locked) pieces
        const cityBounds = {
          minX: cityMinX,
          minY: cityMinY,
          maxX: cityMaxX,
          maxY: cityMaxY,
        }
        const lockedBboxes = piecesState
          .filter((p) => p.isLocked)
          .map((p) => ({
            minX: p.minX,
            minY: p.minY,
            maxX: p.maxX,
            maxY: p.maxY,
          }))
        if (lockedBboxes.length > 0) {
          piecesState = piecesState.map((piece) => {
            if (piece.isLocked) return piece
            const pos = getScatterPosition(
              piece,
              cityBounds,
              width,
              height,
              lockedBboxes,
            )
            return {
              ...piece,
              currentCenterX: pos.x,
              currentCenterY: pos.y,
            }
          })
        }

        setPieces(piecesState)
        setUnlockedOrder(
          piecesState.filter((p) => !p.isLocked).map((p) => p.id),
        )
        setIsReady(true)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load')
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [dimensions, applyStoredState, visitorId])

  /* Persists completed flag and lockedPieceIds whenever pieces change. */
  useEffect(() => {
    if (!visitorId || pieces.length === 0) return
    const completed = pieces.every((p) => p.isLocked)
    const lockedPieceIds = pieces.filter((p) => p.isLocked).map((p) => p.id)
    savePuzzleState(visitorId, { completed, lockedPieceIds })
  }, [pieces, visitorId])

  /* Admin override: lock all pieces.
   * App is responsible for emitting completion analytics and opening the modal
   * when it bumps forceCompleteSignal; we do not call onCompleted here to avoid
   * double-firing completion side effects for override flows.
   */
  useEffect(() => {
    if (!forceCompleteSignal || pieces.length === 0) return
    setPieces((prev) =>
      prev.map((piece) => ({
        ...piece,
        currentCenterX: piece.targetCenterX,
        currentCenterY: piece.targetCenterY,
        isLocked: true,
      })),
    )
  }, [forceCompleteSignal, pieces.length])

  const shuffleSignalRef = useRef(0)
  const clearSignalRef = useRef(0)

  /* When forceShuffleSignal increments, re-scatter only unlocked pieces. */
  useEffect(() => {
    if (forceShuffleSignal === shuffleSignalRef.current) return
    shuffleSignalRef.current = forceShuffleSignal
    const current = piecesRef.current
    if (current.length === 0 || dimensions.width <= 1) return
    const cityBounds = {
      minX: Math.min(...current.map((p) => p.minX)),
      minY: Math.min(...current.map((p) => p.minY)),
      maxX: Math.max(...current.map((p) => p.maxX)),
      maxY: Math.max(...current.map((p) => p.maxY)),
    }
    setPieces((prev) =>
      prev.map((piece) => {
        if (piece.isLocked) return piece
        const pos = getScatterPosition(
          piece,
          cityBounds,
          dimensions.width,
          dimensions.height,
        )
        return {
          ...piece,
          currentCenterX: pos.x,
          currentCenterY: pos.y,
        }
      }),
    )
  }, [forceShuffleSignal, dimensions.width, dimensions.height])

  /* When forceClearSignal increments, unlock all and re-scatter all. */
  useEffect(() => {
    if (forceClearSignal === clearSignalRef.current) return
    clearSignalRef.current = forceClearSignal
    const current = piecesRef.current
    if (current.length === 0 || dimensions.width <= 1) return
    const cityBounds = {
      minX: Math.min(...current.map((p) => p.minX)),
      minY: Math.min(...current.map((p) => p.minY)),
      maxX: Math.max(...current.map((p) => p.maxX)),
      maxY: Math.max(...current.map((p) => p.maxY)),
    }
    const next = current.map((piece) => {
      const pos = getScatterPosition(
        piece,
        cityBounds,
        dimensions.width,
        dimensions.height,
      )
      return {
        ...piece,
        currentCenterX: pos.x,
        currentCenterY: pos.y,
        isLocked: false,
      }
    })
    setPieces(next)
    setUnlockedOrder(next.map((p) => p.id))
  }, [forceClearSignal, dimensions.width, dimensions.height])

  /* Maps client coordinates to SVG coordinate system (for drag math). */
  const getSvgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const transformed = pt.matrixTransform(svg.getScreenCTM()?.inverse())
    return { x: transformed.x, y: transformed.y }
  }, [])

  /* Keeps piece center within canvas so the piece never goes fully off-screen. */
  const clampPosition = useCallback(
    (piece: PieceState, x: number, y: number) => {
      const { width, height } = dimensions
      const dx = x - piece.targetCenterX
      const dy = y - piece.targetCenterY
      const dxClamp = Math.max(-piece.minX, Math.min(width - piece.maxX, dx))
      const dyClamp = Math.max(-piece.minY, Math.min(height - piece.maxY, dy))
      return {
        x: piece.targetCenterX + dxClamp,
        y: piece.targetCenterY + dyClamp,
      }
    },
    [dimensions],
  )

  /* Pointer handlers: capture on piece, track offset, move with clamping; on release, snap if within SNAP_TOLERANCE and optionally fire onNeighborhoodTap for tap (no drag). */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch' && e.button !== 0) return
      const id = (e.currentTarget as SVGElement).getAttribute('data-piece-id')
      if (!id) return
      const piece = pieces.find((p) => p.id === id)
      if (!piece || piece.isLocked) return
      e.preventDefault()
      svgRef.current?.setPointerCapture(e.pointerId)
      const pt = getSvgPoint(e.clientX, e.clientY)
      dragOffsetRef.current = {
        x: piece.currentCenterX - pt.x,
        y: piece.currentCenterY - pt.y,
      }
      dragCenterRef.current = { x: piece.currentCenterX, y: piece.currentCenterY }
      draggingPointerIdRef.current = e.pointerId
      draggingPieceIdRef.current = id
      setDraggingPieceId(id) // for sort/z + CSS class
      setIsDragMoving(false)
      dragStartedRef.current = false
      if (piece.name) {
        onNeighborhoodTap?.(piece.name)
      }
    },
    [pieces, getSvgPoint, onNeighborhoodTap],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const id = draggingPieceIdRef.current
      const dragOffset = dragOffsetRef.current
      if (!id || !dragOffset) return
      if (
        draggingPointerIdRef.current != null &&
        e.pointerId !== draggingPointerIdRef.current
      ) {
        return
      }
      dragStartedRef.current = true
      if (!isDragMoving) setIsDragMoving(true)
      if (!hasReportedPuzzleStartedRef.current) {
        hasReportedPuzzleStartedRef.current = true
        onPuzzleStarted?.()
      }
      const pt = getSvgPoint(e.clientX, e.clientY)
      const newCenterX = pt.x + dragOffset.x
      const newCenterY = pt.y + dragOffset.y
      const piece = piecesRef.current.find((p) => p.id === id)
      if (!piece) return
      const clamped = clampPosition(piece, newCenterX, newCenterY)
      dragCenterRef.current = { x: clamped.x, y: clamped.y }
      requestApplyDragCssVars()
    },
    [
      clampPosition,
      getSvgPoint,
      isDragMoving,
      onPuzzleStarted,
      requestApplyDragCssVars,
    ],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch' && e.button !== 0) return
      const id = draggingPieceIdRef.current
      if (!id) return
      const piece = piecesRef.current.find((p) => p.id === id)
      if (!piece) return
      if (
        draggingPointerIdRef.current != null &&
        e.pointerId !== draggingPointerIdRef.current
      ) {
        return
      }

      const wasDrag = dragStartedRef.current
      dragStartedRef.current = false

      if (piece.name) {
        onNeighborhoodTap?.(piece.name)
      }
      if (!wasDrag && !piece.isLocked) {
        setUnlockedOrder((order) => {
          const i = order.indexOf(id)
          if (i <= 0) return order
          return [id, ...order.slice(0, i), ...order.slice(i + 1)]
        })
      }

      setDraggingPieceId(null)
      setIsDragMoving(false)
      draggingPieceIdRef.current = null
      draggingPointerIdRef.current = null
      dragOffsetRef.current = null

      setPieces((prev) => {
        let snapped = false
        const p = prev.find((x) => x.id === id)
        if (!p) return prev

        const liveCenter = dragCenterRef.current
        if (liveCenter) {
          // Commit final drag position to state once (no per-move re-renders).
          p.currentCenterX = liveCenter.x
          p.currentCenterY = liveCenter.y
        }

        const dx = p.currentCenterX - p.targetCenterX
        const dy = p.currentCenterY - p.targetCenterY
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance > SNAP_TOLERANCE) return prev
        snapped = true
        setUnlockedOrder((order) => order.filter((pid) => pid !== id))
        const next = prev.map((pieceState) =>
          pieceState.id === id
            ? {
                ...pieceState,
                currentCenterX: pieceState.targetCenterX,
                currentCenterY: pieceState.targetCenterY,
                isLocked: true,
              }
            : pieceState,
        )
        const allLocked = next.every((x) => x.isLocked)
        if (allLocked) {
          queueMicrotask(() => onCompleted?.())
        }
        setSnappedPieceId(id)
        if (snapped) {
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(10)
          }
          window.setTimeout(() => {
            setSnappedPieceId((current) => (current === id ? null : current))
          }, 250)
        }
        return next
      })
      if (wasDrag) {
        onMove?.()
      }
    },
    [onNeighborhoodTap, onCompleted, onMove],
  )

  const isNarrow = dimensions.width < 600
  const pieceStrokeWidth = isNarrow ? 1.2 : 1.8
  const outlineStrokeWidth = isNarrow ? 1.2 : 1.6

  /* Error: retry button. Loading: overlay. SVG: viewBox matches dimensions; outline path then pieces in sort order (dragged on top); each piece is a <g> with hit-area path + visible path. */
  if (loadError) {
    return (
      <div
        ref={containerRef}
        className="puzzle-canvas-wrapper puzzle-canvas-wrapper--error"
        role="alert"
      >
        <p>
          {copy.loadError}{' '}
          <button
            type="button"
            onClick={() => {
              setLoadError(null)
              setIsReady(false)
              setDimensions((d) => ({ ...d }))
            }}
          >
            {copy.retry}
          </button>
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="puzzle-canvas-wrapper"
      aria-busy={!isReady}
    >
      {!isReady && !loadError && (
        <div className="puzzle-loading-overlay" aria-hidden="true">
          <span className="puzzle-loading-text">
            {copy.loadingNeighborhoods}
          </span>
        </div>
      )}
      <svg
        ref={svgRef}
        className="puzzle-svg"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <defs>
          <filter
            id="piece-drop-shadow"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feDropShadow
              dx={4}
              dy={4}
              stdDeviation={3}
              floodColor="rgba(0,0,0,0.25)"
            />
          </filter>
        </defs>
        {/* City outline silhouette behind pieces; non-interactive so it never blocks piece drag/tap */}
        {outlinePath && (
          <path
            className="puzzle-outline"
            d={outlinePath}
            fill="none"
            stroke="var(--map-outline, #9ca3af)"
            strokeWidth={outlineStrokeWidth}
            strokeOpacity={0.75}
            style={{ pointerEvents: 'none' }}
            aria-hidden="true"
          />
        )}
        {[...pieces]
          .sort((a, b) => {
            if (a.isLocked && !b.isLocked) return -1
            if (!a.isLocked && b.isLocked) return 1
            if (a.id === draggingPieceId) return 1
            if (b.id === draggingPieceId) return -1
            const ai = unlockedOrder.indexOf(a.id)
            const bi = unlockedOrder.indexOf(b.id)
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
          })
          .map((piece) => {
            const dx = piece.currentCenterX - piece.targetCenterX
            const dy = piece.currentCenterY - piece.targetCenterY
            const isDragging = draggingPieceId === piece.id
            const isSnapped = snappedPieceId === piece.id
            const transformVars = {
              // Used by CSS transform; during active drag these values are updated via rAF (no React re-render).
              ['--piece-dx' as any]: `${dx}px`,
              ['--piece-dy' as any]: `${dy}px`,
            } as React.CSSProperties
            return (
              <g
                key={piece.id}
                data-piece-id={piece.id}
                ref={(el) => setPieceEl(piece.id, el)}
                className={[
                  'puzzle-piece',
                  piece.isLocked ? 'puzzle-piece--locked' : 'puzzle-piece--free',
                  isDragging ? 'puzzle-piece--dragging' : '',
                  isDragMoving && isDragging ? 'puzzle-piece--moving' : '',
                  isSnapped ? 'puzzle-piece--snapped' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={transformVars}
                onPointerDown={handlePointerDown}
              >
                {/* Barely-visible wide stroke to enlarge touch target on mobile */}
                <path
                  d={piece.pathString}
                  fill="none"
                  stroke="rgba(0,0,0,0.004)"
                  strokeWidth={28}
                  style={{ pointerEvents: 'auto' }}
                  aria-hidden="true"
                />
                <path
                  className="puzzle-piece-path"
                  d={piece.pathString}
                  strokeWidth={isSnapped ? pieceStrokeWidth + 0.5 : pieceStrokeWidth}
                  aria-label={piece.name}
                />
              </g>
            )
          })}
      </svg>
    </div>
  )
}
