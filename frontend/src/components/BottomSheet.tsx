import './BottomSheet.css'
import {
  type PointerEventHandler,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

type SnapPoint = 'collapsed' | 'expanded'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).has('debug')
  } catch {
    return false
  }
}

export function BottomSheet(props: {
  title: string
  peekHeightPx?: number
  defaultSnap?: SnapPoint
  children: React.ReactNode
}) {
  const { title, children, peekHeightPx = 84, defaultSnap = 'collapsed' } = props
  const debugEnabledRef = useRef(isDebugEnabled())

  const sheetRef = useRef<HTMLDivElement | null>(null)
  const [maxTranslateY, setMaxTranslateY] = useState(0)
  const [suppressTransition, setSuppressTransition] = useState(false)
  const suppressTransitionRafRef = useRef<number | null>(null)

  const defaultTranslateY = useMemo(() => {
    return defaultSnap === 'expanded' ? 0 : maxTranslateY
  }, [defaultSnap, maxTranslateY])

  const [translateY, setTranslateY] = useState(defaultTranslateY)
  const [snap, setSnap] = useState<SnapPoint>(defaultSnap)

  const dragStateRef = useRef<{
    pointerId: number
    startY: number
    startTranslateY: number
    lastY: number
    lastT: number
    velocity: number
    isDragging: boolean
  } | null>(null)

  useLayoutEffect(() => {
    const el = sheetRef.current
    if (!el) return

    const measure = () => {
      const rect = el.getBoundingClientRect()
      const nextMax = Math.max(0, Math.round(rect.height - peekHeightPx))
      if (debugEnabledRef.current) {
        console.info('[BottomSheet debug] measure', {
          height: Math.round(rect.height),
          peekHeightPx,
          nextMaxTranslateY: nextMax,
          prevMaxTranslateY: maxTranslateY,
          snap,
          translateY,
        })
      }
      // Content changes (like switching neighborhoods) can change height and thus maxTranslateY.
      // Suppress the transform transition for this automatic adjustment to avoid a "bounce".
      if (nextMax !== maxTranslateY && !dragStateRef.current?.isDragging) {
        setSuppressTransition(true)
        if (suppressTransitionRafRef.current != null) {
          cancelAnimationFrame(suppressTransitionRafRef.current)
        }
        suppressTransitionRafRef.current = requestAnimationFrame(() => {
          suppressTransitionRafRef.current = null
          setSuppressTransition(false)
          if (debugEnabledRef.current) {
            console.info('[BottomSheet debug] suppressTransition off')
          }
        })
        if (debugEnabledRef.current) {
          console.info('[BottomSheet debug] suppressTransition on')
        }
      }
      setMaxTranslateY(nextMax)
    }

    measure()

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => measure())
      ro.observe(el)
      return () => ro.disconnect()
    }

    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [peekHeightPx, maxTranslateY])

  useEffect(() => {
    return () => {
      if (suppressTransitionRafRef.current != null) {
        cancelAnimationFrame(suppressTransitionRafRef.current)
      }
    }
  }, [])

  useEffect(() => {
    // Keep translateY consistent when maxTranslateY changes (rotation, font load, etc.)
    setTranslateY((prev) => clamp(prev, 0, maxTranslateY))
  }, [maxTranslateY])

  useEffect(() => {
    // Sync initial state once we know maxTranslateY.
    setTranslateY(defaultSnap === 'expanded' ? 0 : maxTranslateY)
    setSnap(defaultSnap)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxTranslateY])

  const setToSnap = (next: SnapPoint) => {
    setSnap(next)
    setTranslateY(next === 'expanded' ? 0 : maxTranslateY)
  }

  const onPointerDown: PointerEventHandler<HTMLButtonElement> = (e) => {
    if (e.button !== 0) return
    const handleEl = e.currentTarget
    handleEl.setPointerCapture(e.pointerId)

    dragStateRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startTranslateY: translateY,
      lastY: e.clientY,
      lastT: performance.now(),
      velocity: 0,
      isDragging: false,
    }
  }

  const onPointerMove: PointerEventHandler<HTMLButtonElement> = (e) => {
    const state = dragStateRef.current
    if (!state || state.pointerId !== e.pointerId) return

    const nowT = performance.now()
    const dy = e.clientY - state.startY
    const nextTranslate = clamp(state.startTranslateY + dy, 0, maxTranslateY)

    const dt = Math.max(1, nowT - state.lastT)
    const ddy = e.clientY - state.lastY
    state.velocity = ddy / dt // px/ms
    state.lastY = e.clientY
    state.lastT = nowT
    state.isDragging = state.isDragging || Math.abs(dy) > 2

    setTranslateY(nextTranslate)
  }

  const onPointerUpOrCancel: PointerEventHandler<HTMLButtonElement> = (e) => {
    const state = dragStateRef.current
    if (!state || state.pointerId !== e.pointerId) return

    const v = state.velocity
    const halfway = maxTranslateY * 0.5
    const fastThreshold = 0.6 // px/ms ~ 600px/s

    if (!state.isDragging) {
      setToSnap(snap === 'expanded' ? 'collapsed' : 'expanded')
      dragStateRef.current = null
      return
    }

    if (v > fastThreshold) {
      setToSnap('collapsed')
    } else if (v < -fastThreshold) {
      setToSnap('expanded')
    } else {
      setToSnap(translateY > halfway ? 'collapsed' : 'expanded')
    }

    dragStateRef.current = null
  }

  const isCollapsed = snap === 'collapsed'

  return (
    <div className="bottom-sheet-portal" aria-label={title}>
      <div
        ref={sheetRef}
        className={[
          'bottom-sheet',
          isCollapsed ? 'bottom-sheet--collapsed' : 'bottom-sheet--expanded',
          suppressTransition ? 'bottom-sheet--no-transition' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          transform: `translate3d(0, ${translateY}px, 0)`,
        }}
      >
        <button
          type="button"
          className="bottom-sheet__handle"
          aria-label={title}
          aria-expanded={!isCollapsed}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUpOrCancel}
          onPointerCancel={onPointerUpOrCancel}
        >
          <span className="bottom-sheet__grab" aria-hidden="true" />
          <span className="bottom-sheet__title">{title}</span>
          <span className="bottom-sheet__chevron" aria-hidden="true">
            {isCollapsed ? 'Swipe up' : 'Swipe down'}
          </span>
        </button>

        <div
          className="bottom-sheet__content"
          // When collapsed, allow puzzle drags behind the sheet body; handle still works.
          style={{ pointerEvents: isCollapsed ? 'none' : 'auto' }}
        >
          <div className="bottom-sheet__content-inner">{children}</div>
        </div>
      </div>
    </div>
  )
}

