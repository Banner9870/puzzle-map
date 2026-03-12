declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

type DeviceType = 'mobile' | 'tablet' | 'desktop'
type Orientation = 'portrait' | 'landscape'

function getMeasurementId(): string | null {
  const id = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined
  return id && id.length > 0 ? id : null
}

export function detectDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'desktop'
  const width = window.innerWidth || 1024
  if (width < 640) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

export function detectOrientation(): Orientation {
  if (typeof window === 'undefined') return 'landscape'
  const width = window.innerWidth || 1
  const height = window.innerHeight || 1
  return height >= width ? 'portrait' : 'landscape'
}

function ensureGtagInitialized() {
  if (typeof window === 'undefined') return
  if (window.gtag) return

  const measurementId = getMeasurementId()
  if (!measurementId) return

  window.dataLayer = window.dataLayer || []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function gtag(...args: any[]) {
    window.dataLayer?.push(args)
  }
  window.gtag = gtag

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  document.head.appendChild(script)

  window.gtag('js', new Date())
}

export function initAnalytics(userId: string) {
  const measurementId = getMeasurementId()
  if (!measurementId) return
  ensureGtagInitialized()
  if (!window.gtag) return

  window.gtag('config', measurementId, {
    user_id: userId,
  })
}

export function trackUserUuidCreated() {
  if (!window.gtag) return
  window.gtag('event', 'user_uuid_created', {})
}

export function trackPuzzleView(options: {
  deviceType: DeviceType
  orientation: Orientation
  returningUser: boolean
  puzzleCompleted: boolean
}) {
  if (!window.gtag) return
  window.gtag('event', 'puzzle_view', {
    device_type: options.deviceType,
    orientation: options.orientation,
    returning_user: options.returningUser,
    puzzle_completed: options.puzzleCompleted,
  })
}

export function trackPuzzleStarted(options: {
  deviceType: DeviceType
  orientation: Orientation
  timeFromLoadMs: number
}) {
  if (!window.gtag) return
  window.gtag('event', 'puzzle_started', {
    device_type: options.deviceType,
    orientation: options.orientation,
    time_from_load_ms: Math.round(options.timeFromLoadMs),
  })
}

export function trackPuzzleCompleted(options: {
  deviceType: DeviceType
  orientation: Orientation
  durationMs: number
  movesCount: number
}) {
  if (!window.gtag) return
  window.gtag('event', 'puzzle_completed', {
    device_type: options.deviceType,
    orientation: options.orientation,
    duration_ms: Math.round(options.durationMs),
    moves_count: options.movesCount,
  })
}

// Email events are defined here for Phase 3 so that
// later phases can call them from UI + backend flows.

export function trackEmailSubmitAttempt(options: {
  deviceType: DeviceType
  hasCompletedPuzzle: boolean
}) {
  if (!window.gtag) return
  window.gtag('event', 'email_submit_attempt', {
    device_type: options.deviceType,
    has_completed_puzzle: options.hasCompletedPuzzle,
  })
}

export function trackEmailSubmitSuccess(options: {
  deviceType: DeviceType
  hasCompletedPuzzle: boolean
}) {
  if (!window.gtag) return
  window.gtag('event', 'email_submit_success', {
    device_type: options.deviceType,
    has_completed_puzzle: options.hasCompletedPuzzle,
  })
}

export function trackEmailSubmitFailure(options: {
  deviceType: DeviceType
  errorType: 'validation' | 'network' | 'server'
}) {
  if (!window.gtag) return
  window.gtag('event', 'email_submit_failure', {
    device_type: options.deviceType,
    error_type: options.errorType,
  })
}

