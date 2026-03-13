import { useCallback, useEffect, useRef, useState } from 'react'
import { geoConicConformal, geoPath, type GeoProjection } from 'd3-geo'
import {
  loadPuzzleState,
  savePuzzleState,
  type PuzzleState,
  type StoredPieceState,
} from '../persistence'

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
  forceCompleteSignal?: number
}

const SNAP_TOLERANCE = 24

function getCssColor(variableName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(
    variableName,
  )
  return value.trim() || fallback
}

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
}: PuzzleCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 })
  const [pieces, setPieces] = useState<PieceState[]>([])
  const [outlinePath, setOutlinePath] = useState<string>('')
  const [isReady, setIsReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draggingPieceId, setDraggingPieceId] = useState<string | null>(null)
  const [snappedPieceId, setSnappedPieceId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null,
  )
  const dragStartedRef = useRef(false)
  const hasReportedPuzzleStartedRef = useRef(false)

  const applyStoredState = useCallback(
    (basePieces: PieceState[], stored: PuzzleState | null): PieceState[] => {
      if (!stored) return basePieces
      const map = new Map<string, StoredPieceState>()
      for (const entry of stored.placedPieces ?? []) {
        map.set(entry.id, entry)
      }
      const next = basePieces.map((piece) => {
        const storedPiece = map.get(piece.id)
        if (!storedPiece) return piece
        return {
          ...piece,
          currentCenterX: storedPiece.currentCenterX,
          currentCenterY: storedPiece.currentCenterY,
          isLocked: storedPiece.isLocked,
        }
      })
      if (stored.completed) {
        return next.map((piece) => ({
          ...piece,
          currentCenterX: piece.targetCenterX,
          currentCenterY: piece.targetCenterY,
          isLocked: true,
        }))
      }
      return next
    },
    [],
  )

  // Resize observer to keep dimensions in sync
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

  // Load GeoJSON and build piece state (once we have dimensions)
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
          const margin = 16
          const gap = 24
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
        setPieces(piecesState)
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

  useEffect(() => {
    if (!visitorId || pieces.length === 0) return
    const storedPieces: StoredPieceState[] = pieces.map((piece) => ({
      id: piece.id,
      currentCenterX: piece.currentCenterX,
      currentCenterY: piece.currentCenterY,
      isLocked: piece.isLocked,
    }))
    const completed = pieces.every((p) => p.isLocked)
    const state: PuzzleState = {
      completed,
      placedPieces: storedPieces,
    }
    savePuzzleState(visitorId, state)
  }, [pieces, visitorId])

  // When an admin override is triggered, snap all pieces into place,
  // mark them locked, and emit completion through the existing callback.
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
    queueMicrotask(() => {
      onCompleted?.()
    })
  }, [forceCompleteSignal, pieces.length, onCompleted])

  const getSvgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const transformed = pt.matrixTransform(svg.getScreenCTM()?.inverse())
    return { x: transformed.x, y: transformed.y }
  }, [])

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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      const id = (e.currentTarget as SVGElement).getAttribute('data-piece-id')
      if (!id) return
      const piece = pieces.find((p) => p.id === id)
      if (!piece || piece.isLocked) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const pt = getSvgPoint(e.clientX, e.clientY)
      setDragOffset({
        x: piece.currentCenterX - pt.x,
        y: piece.currentCenterY - pt.y,
      })
      setDraggingPieceId(id)
      dragStartedRef.current = false
    },
    [pieces, getSvgPoint],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingPieceId || !dragOffset) return
      dragStartedRef.current = true
      if (!hasReportedPuzzleStartedRef.current) {
        hasReportedPuzzleStartedRef.current = true
        onPuzzleStarted?.()
      }
      const pt = getSvgPoint(e.clientX, e.clientY)
      const newCenterX = pt.x + dragOffset.x
      const newCenterY = pt.y + dragOffset.y
      const piece = pieces.find((p) => p.id === draggingPieceId)
      if (!piece) return
      const clamped = clampPosition(piece, newCenterX, newCenterY)
      setPieces((prev) =>
        prev.map((p) =>
          p.id === draggingPieceId
            ? {
                ...p,
                currentCenterX: clamped.x,
                currentCenterY: clamped.y,
              }
            : p,
        ),
      )
    },
    [draggingPieceId, dragOffset, pieces, getSvgPoint, clampPosition],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      const id = (e.currentTarget as SVGElement).getAttribute('data-piece-id')
      if (!id) return
      const piece = pieces.find((p) => p.id === id)
      if (!piece) return

      const wasDrag = dragStartedRef.current
      dragStartedRef.current = false

      if (!dragStartedRef.current && piece.name) {
        onNeighborhoodTap?.(piece.name)
      }

      if (draggingPieceId !== id) return
      setDraggingPieceId(null)
      setDragOffset(null)

      setPieces((prev) => {
        let snapped = false
        const p = prev.find((x) => x.id === id)
        if (!p) return prev
        const dx = p.currentCenterX - p.targetCenterX
        const dy = p.currentCenterY - p.targetCenterY
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance > SNAP_TOLERANCE) return prev
        snapped = true
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
        if (snapped) {
          setSnappedPieceId(id)
          window.setTimeout(() => {
            setSnappedPieceId((current) => (current === id ? null : current))
          }, 200)
        }
        return next
      })
      if (wasDrag) {
        onMove?.()
      }
    },
    [pieces, draggingPieceId, onNeighborhoodTap, onCompleted, onMove],
  )

  const pieceFill = getCssColor('--brand-red', '#ed0000')
  const pieceStroke = getCssColor('--map-outline', '#9ca3af')
  const outlineStroke = getCssColor('--map-outline', '#9ca3af')

  if (loadError) {
    return (
      <div
        ref={containerRef}
        className="puzzle-canvas-wrapper puzzle-canvas-wrapper--error"
        role="alert"
      >
        <p>
          Something went wrong loading the puzzle.{' '}
          <button
            type="button"
            onClick={() => {
              setLoadError(null)
              setIsReady(false)
              setDimensions((d) => ({ ...d }))
            }}
          >
            Retry
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
        {/* City outline silhouette behind pieces */}
        {outlinePath && (
          <path
            className="puzzle-outline"
            d={outlinePath}
            fill="none"
            stroke={outlineStroke}
            strokeWidth={2}
            strokeOpacity={0.75}
          />
        )}
        {[...pieces]
          .sort((a, b) =>
            a.id === draggingPieceId ? 1 : b.id === draggingPieceId ? -1 : 0,
          )
          .map((piece) => {
            const dx = piece.currentCenterX - piece.targetCenterX
            const dy = piece.currentCenterY - piece.targetCenterY
            const isDragging = draggingPieceId === piece.id
            const tx = piece.targetCenterX
            const ty = piece.targetCenterY
            const isSnapped = snappedPieceId === piece.id
            const transform = isDragging
              ? `translate(${dx + tx}, ${dy + ty}) scale(1.02) translate(${-tx}, ${-ty})`
              : isSnapped
                ? `translate(${dx + tx}, ${dy + ty}) scale(1.04) translate(${-tx}, ${-ty})`
                : `translate(${dx}, ${dy})`
            return (
              <g
                key={piece.id}
                data-piece-id={piece.id}
                transform={transform}
                style={{
                  cursor: piece.isLocked ? 'default' : 'grab',
                  pointerEvents: piece.isLocked ? 'none' : 'auto',
                  filter: piece.isLocked ? undefined : 'url(#piece-drop-shadow)',
                  transition: 'transform 160ms ease-out, filter 160ms ease-out',
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                <path
                  d={piece.pathString}
                  fill={pieceFill}
                  fillOpacity={0.3}
                  stroke={pieceStroke}
                  strokeWidth={2.6}
                  style={{
                    cursor: piece.isLocked ? 'default' : 'grab',
                  }}
                  aria-label={piece.name}
                />
              </g>
            )
          })}
      </svg>
    </div>
  )
}
