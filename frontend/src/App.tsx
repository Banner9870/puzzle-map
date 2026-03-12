import './App.css'
import { useEffect, useState } from 'react'
import { PuzzleCanvas } from './components/PuzzleCanvas'
import { getOrCreateVisitorId, loadPuzzleState } from './persistence'
import {
  detectDeviceType,
  detectOrientation,
  initAnalytics,
  trackPuzzleCompleted,
  trackEmailSubmitAttempt,
  trackEmailSubmitFailure,
  trackEmailSubmitSuccess,
  trackPuzzleStarted,
  trackPuzzleView,
  trackUserUuidCreated,
  trackOverrideJumpToComplete,
} from './analytics'

type Theme = 'light' | 'dark'

const appLoadTime = typeof performance !== 'undefined' ? performance.now() : 0

function getInitialTheme(): Theme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    try {
      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches
      return prefersDark ? 'dark' : 'light'
    } catch {
      // fall through to light
    }
  }
  return 'light'
}

function App() {
  const [lastNeighborhood, setLastNeighborhood] = useState<string | null>(null)
  const [isCompleted, setIsCompleted] = useState(false)
  const [visitorId, setVisitorId] = useState<string | null>(null)
  const [hasHydratedVisitor, setHasHydratedVisitor] = useState(false)
  const [hasEmittedPuzzleStarted, setHasEmittedPuzzleStarted] = useState(false)
  const [movesCount, setMovesCount] = useState(0)
  const [puzzleStartedAt, setPuzzleStartedAt] = useState<number | null>(null)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false)
  const [emailValue, setEmailValue] = useState('')
  const [emailStatus, setEmailStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [titleClickCount, setTitleClickCount] = useState(0)
  const [titleClickWindowStart, setTitleClickWindowStart] = useState<
    number | null
  >(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    const result = getOrCreateVisitorId()
    if (!result) {
      setHasHydratedVisitor(true)
      return
    }

    const { id, isNew } = result
    setVisitorId(id)
    setHasHydratedVisitor(true)

    const stored = loadPuzzleState(id)
    const completedFromStorage = stored?.completed ?? false
    setIsCompleted(completedFromStorage)
    if (completedFromStorage) {
      setIsCompletionModalOpen(true)
    }

    const deviceType = detectDeviceType()
    const orientation = detectOrientation()

    initAnalytics(id)
    if (isNew) {
      trackUserUuidCreated()
    }

    trackPuzzleView({
      deviceType,
      orientation,
      returningUser: !isNew,
      puzzleCompleted: completedFromStorage,
    })
  }, [])

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  const validateEmail = (value: string): string | null => {
    const trimmed = value.trim()
    if (!trimmed) return 'Please enter an email address.'
    // Simple but effective email pattern for prototype.
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!pattern.test(trimmed)) return 'That email address does not look valid.'
    return null
  }

  const handleSubmitEmail: React.FormEventHandler<HTMLFormElement> = async (
    event,
  ) => {
    event.preventDefault()
    if (!visitorId) {
      setEmailError('Something went wrong identifying this session. Please reload.')
      setEmailStatus('error')
      return
    }

    const deviceType = detectDeviceType()
    const hasCompletedPuzzle = isCompleted

    const validationMessage = validateEmail(emailValue)
    if (validationMessage) {
      setEmailError(validationMessage)
      setEmailStatus('error')
      trackEmailSubmitFailure({
        deviceType,
        errorType: 'validation',
      })
      return
    }

    setEmailError(null)
    setEmailStatus('submitting')

    trackEmailSubmitAttempt({
      deviceType,
      hasCompletedPuzzle,
    })

    const backendBase =
      (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? ''
    const endpoint =
      backendBase && backendBase.length > 0
        ? `${backendBase.replace(/\/+$/, '')}/api/early-access`
        : '/api/early-access'

    const nowIso = new Date().toISOString()
    const url = new URL(window.location.href)
    const params = url.searchParams

    const payload = {
      uuid: visitorId,
      email: emailValue.trim(),
      completed_at: hasCompletedPuzzle ? nowIso : null,
      user_agent: navigator.userAgent,
      referrer: document.referrer || null,
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        setEmailStatus('error')
        setEmailError('We could not save your email. Please try again.')
        trackEmailSubmitFailure({
          deviceType,
          errorType: 'server',
        })
        return
      }

      setEmailStatus('success')
      trackEmailSubmitSuccess({
        deviceType,
        hasCompletedPuzzle,
      })
    } catch {
      setEmailStatus('error')
      setEmailError('Network error. Please check your connection and try again.')
      trackEmailSubmitFailure({
        deviceType,
        errorType: 'network',
      })
    }
  }

  const handleTitleClick: React.MouseEventHandler<HTMLHeadingElement> = () => {
    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now()
    const windowMs = 3000

    if (titleClickWindowStart == null || now - titleClickWindowStart > windowMs) {
      setTitleClickWindowStart(now)
      setTitleClickCount(1)
      return
    }

    const nextCount = titleClickCount + 1
    setTitleClickCount(nextCount)

    if (!isCompleted && nextCount >= 5) {
      const deviceType = detectDeviceType()
      const orientation = detectOrientation()
      trackOverrideJumpToComplete({ deviceType, orientation })
      setIsCompleted(true)
      setIsCompletionModalOpen(true)
    }
  }

  if (!hasHydratedVisitor) {
    return (
      <div className="page">
        <main className="page-inner">
          <p className="puzzle-shell-caption">Loading puzzle…</p>
        </main>
      </div>
    )
  }

  return (
    <div className="page">
      <main className="page-inner">
        <header className="page-header">
          <div className="page-header-inner">
            <div className="page-title-block">
              <h1
                className="page-title"
                onClick={handleTitleClick}
              >
                Help us map Chicago together.
              </h1>
              <p className="page-subtitle">
                A jigsaw puzzle made from the city&apos;s neighborhoods — a
                small preview of what we&apos;re building with chicago.com.
              </p>
            </div>
            <button
              type="button"
              className="theme-toggle"
              onClick={handleToggleTheme}
              aria-label={
                theme === 'dark'
                  ? 'Switch to light theme'
                  : 'Switch to dark theme'
              }
              aria-pressed={theme === 'dark'}
            >
              <span className="theme-toggle-label">Theme</span>
              <span className="theme-toggle-value">
                {theme === 'dark' ? 'Dark' : 'Light'}
              </span>
            </button>
          </div>
        </header>

        <section
          className="layout-main"
          aria-label="Chicago puzzle and information"
        >
          <section className="layout-main-primary" aria-label="Chicago puzzle">
            <section className="puzzle-shell">
              <div className="puzzle-shell-inner">
                <PuzzleCanvas
                  onNeighborhoodTap={(name) => setLastNeighborhood(name)}
                  onCompleted={() => {
                    setIsCompleted(true)
                    setIsCompletionModalOpen(true)
                    const deviceType = detectDeviceType()
                    const orientation = detectOrientation()
                    const now =
                      typeof performance !== 'undefined'
                        ? performance.now()
                        : Date.now()
                    const startTime = puzzleStartedAt ?? appLoadTime
                    const durationMs = now - startTime
                    trackPuzzleCompleted({
                      deviceType,
                      orientation,
                      durationMs,
                      movesCount,
                    })
                  }}
                  visitorId={visitorId}
                  onPuzzleStarted={() => {
                    if (hasEmittedPuzzleStarted) return
                    const now =
                      typeof performance !== 'undefined'
                        ? performance.now()
                        : Date.now()
                    setPuzzleStartedAt(now)
                    setHasEmittedPuzzleStarted(true)
                    const deviceType = detectDeviceType()
                    const orientation = detectOrientation()
                    const timeFromLoadMs = now - appLoadTime
                    trackPuzzleStarted({
                      deviceType,
                      orientation,
                      timeFromLoadMs,
                    })
                  }}
                  onMove={() => {
                    setMovesCount((prev) => prev + 1)
                  }}
                />
              </div>
              <p className="puzzle-shell-caption">
                Drag each neighborhood back into place to complete the map.
                Pieces will gently snap into the outline when you&apos;re close
                enough.
              </p>
              {lastNeighborhood && (
                <p className="puzzle-shell-caption">
                  You last tapped <strong>{lastNeighborhood}</strong>.
                </p>
              )}
              {isCompleted && (
                <p className="puzzle-shell-caption">
                  Puzzle complete. Check the message below to get early access
                  updates.
                </p>
              )}
            </section>
          </section>

          <aside
            className="layout-main-sidebar"
            aria-label="About this puzzle experience"
          >
            <h2 className="sidebar-title">Why this puzzle?</h2>
            <p className="sidebar-body">
              chicago.com is a new way for Chicagoans to see the city, block by
              block. This prototype turns the city&apos;s official community
              areas into a hands-on map you can piece together.
            </p>
            <p className="sidebar-body">
              On phones and tablets, the puzzle fills most of the screen so you
              can drag comfortably. On larger screens, the map sits alongside
              this explainer so it feels more like a landing page than a toy.
            </p>
            <p className="sidebar-body sidebar-body--muted">
              In a later phase, finishing the puzzle will unlock a short note
              about the project and an option to get early access updates.
            </p>
          </aside>
        </section>

        {isCompletionModalOpen && (
          <div className="completion-modal-backdrop" role="presentation">
            <div
              className="completion-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="completion-modal-title"
            >
              <h2 id="completion-modal-title" className="completion-modal-title">
                You mapped Chicago.
              </h2>
              <p className="completion-modal-body">
                We&apos;re building chicago.com as a new way for Chicagoans to
                see their city, neighborhood by neighborhood. Drop your email
                below if you&apos;d like early access when it&apos;s ready.
              </p>
              <form className="completion-modal-form" onSubmit={handleSubmitEmail}>
                <label className="completion-modal-label">
                  <span className="completion-modal-label-text">Email address</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={emailValue}
                    onChange={(event) => setEmailValue(event.target.value)}
                    className="completion-modal-input"
                    required
                  />
                </label>
                {emailError && (
                  <p className="completion-modal-error" role="alert">
                    {emailError}
                  </p>
                )}
                <div className="completion-modal-actions">
                  <button
                    type="submit"
                    disabled={emailStatus === 'submitting'}
                  >
                    {emailStatus === 'submitting'
                      ? 'Sending…'
                      : 'Get early access updates'}
                  </button>
                  <button
                    type="button"
                    className="completion-modal-secondary"
                    onClick={() => setIsCompletionModalOpen(false)}
                  >
                    Maybe later
                  </button>
                </div>
                {emailStatus === 'success' && (
                  <p className="completion-modal-success">
                    Thanks — you&apos;re on the list. We&apos;ll be in touch as
                    chicago.com takes shape.
                  </p>
                )}
              </form>
              <p className="completion-modal-privacy">
                We&apos;ll only use your email for updates about this project.
                For full terms and privacy details, see Chicago Public Media&apos;s
                main site.
              </p>
            </div>
          </div>
        )}

        <footer className="page-footer">
          <p>
            A prototype from <strong>Chicago Public Media</strong>, created to
            explore what&apos;s possible with chicago.com.
          </p>
          <p>
            Light-touch prototype only; final experience will follow full terms
            and privacy standards on the main site.
          </p>
        </footer>
      </main>
    </div>
  )
}

export default App
