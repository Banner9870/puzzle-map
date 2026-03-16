/**
 * App is the shell: theme, visitor id, puzzle completion modal, and email capture.
 * Renders PuzzleCanvas and handles all analytics and persistence for the puzzle and signup.
 */
import './App.css'
import { useEffect, useState } from 'react'
import { PuzzleCanvas } from './components/PuzzleCanvas'
import { BottomSheet } from './components/BottomSheet'
import { NeighborhoodCard } from './components/NeighborhoodCard'
import { copy } from './content'
import {
  clearPuzzleState,
  getEmailSubmitted,
  getOrCreateVisitorId,
  loadPuzzleState,
  setEmailSubmitted,
} from './persistence'
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

/* Uses prefers-color-scheme; defaults to light if unavailable. */
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
  /* State groups: visitor/completion, modal/email form, theme, admin click counter and force signals for PuzzleCanvas. */
  const [lastNeighborhood, setLastNeighborhood] = useState<string | null>(null)
  const [isCompleted, setIsCompleted] = useState(false)
  const [visitorId, setVisitorId] = useState<string | null>(null)
  const [hasHydratedVisitor, setHasHydratedVisitor] = useState(false)
  const [hasEmittedPuzzleStarted, setHasEmittedPuzzleStarted] = useState(false)
  const [movesCount, setMovesCount] = useState(0)
  const [puzzleStartedAt, setPuzzleStartedAt] = useState<number | null>(null)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false)
  const [hasSubmittedEmail, setHasSubmittedEmail] = useState(false)
  const [emailValue, setEmailValue] = useState('')
  const [emailStatus, setEmailStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [titleClickCount, setTitleClickCount] = useState(0)
  const [titleClickWindowStart, setTitleClickWindowStart] = useState<
    number | null
  >(null)
  const [completionEventId, setCompletionEventId] = useState(0)
  const [forceCompleteSignal, setForceCompleteSignal] = useState(0)
  const [forceShuffleSignal, setForceShuffleSignal] = useState(0)
  const [forceClearSignal, setForceClearSignal] = useState(0)
  const [isMobilePortrait, setIsMobilePortrait] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = '(max-width: 767px) and (orientation: portrait)'
    const mql = window.matchMedia(query)

    const update = () => setIsMobilePortrait(Boolean(mql.matches))
    update()

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', update)
      return () => mql.removeEventListener('change', update)
    }

    // Safari < 14
    // eslint-disable-next-line deprecation/deprecation
    mql.addListener(update)
    // eslint-disable-next-line deprecation/deprecation
    return () => mql.removeListener(update)
  }, [])

  /* Get or create visitor id, load puzzle state, init GA, track puzzle_view; open completion modal if already completed. */
  useEffect(() => {
    const result = getOrCreateVisitorId()
    if (!result) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasHydratedVisitor(true)
      return
    }

    const { id, isNew } = result
    setVisitorId(id)
    setHasHydratedVisitor(true)

    const stored = loadPuzzleState(id)
    const completedFromStorage = stored?.completed ?? false
    setIsCompleted(completedFromStorage)
    setHasSubmittedEmail(getEmailSubmitted(id))
    if (completedFromStorage) setCompletionEventId((n) => n + 1)

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

  /* Treat completion as an event: any new completion/override should open the modal again. */
  useEffect(() => {
    if (completionEventId <= 0) return
    if (visitorId) {
      const alreadySubmitted = getEmailSubmitted(visitorId)
      setHasSubmittedEmail(alreadySubmitted)
      setEmailStatus(alreadySubmitted ? 'success' : 'idle')
      setEmailError(null)
      if (!alreadySubmitted) setEmailValue('')
    } else {
      setHasSubmittedEmail(false)
      setEmailStatus('idle')
      setEmailError(null)
    }
    setIsCompletionModalOpen(true)
  }, [completionEventId, visitorId])

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  /* Bump force signals so PuzzleCanvas re-scatters or clears; handleClearPuzzle also clears stored state and resets completion modal. */
  const handleShufflePieces = () => {
    setForceShuffleSignal((n) => n + 1)
  }

  const handleClearPuzzle = () => {
    if (visitorId) {
      clearPuzzleState(visitorId)
    }
    setIsCompleted(false)
    setIsCompletionModalOpen(false)
    setEmailStatus('idle')
    setEmailError(null)
    setForceClearSignal((n) => n + 1)
  }

  /* Client-side validation only; returns copy string or null. */
  const validateEmail = (value: string): string | null => {
    const trimmed = value.trim()
    if (!trimmed) return copy.emailRequired
    // Simple but effective email pattern for prototype.
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!pattern.test(trimmed)) return copy.emailInvalid
    return null
  }

  /* Validate → track attempt → POST /api/early-access → track success/failure and set email status/error. */
  const handleSubmitEmail: React.FormEventHandler<HTMLFormElement> = async (
    event,
  ) => {
    event.preventDefault()
    if (!visitorId) {
      setEmailError(copy.sessionError)
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
        setEmailError(copy.submitError)
        trackEmailSubmitFailure({
          deviceType,
          errorType: 'server',
        })
        return
      }

      setEmailStatus('success')
      if (visitorId) {
        setEmailSubmitted(visitorId)
        setHasSubmittedEmail(true)
      }
      trackEmailSubmitSuccess({
        deviceType,
        hasCompletedPuzzle,
      })
    } catch {
      setEmailStatus('error')
      setEmailError(copy.networkError)
      trackEmailSubmitFailure({
        deviceType,
        errorType: 'network',
      })
    }
  }

  /* Five clicks within ~3s set forceCompleteSignal (admin override) and track override event. */
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
      setForceCompleteSignal((value) => value + 1)
      setIsCompleted(true)
      setCompletionEventId((n) => n + 1)
    }
  }

  if (!hasHydratedVisitor) {
    return (
      <div className="page">
        <main className="page-inner">
          <p className="puzzle-shell-caption">{copy.loadingPuzzle}</p>
        </main>
      </div>
    )
  }

  /* Layout: theme toggle, puzzle shell (heading + PuzzleCanvas + caption), completion modal (when open), footer. PuzzleCanvas receives visitorId, completion/shuffle/clear handlers, and force signals. */
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
                {copy.headline}
              </h1>
              <p className="page-subtitle">
                {copy.subheadline}
              </p>
            </div>
            <div className="header-actions">
              <button
                type="button"
                className="puzzle-action puzzle-action-shuffle"
                onClick={handleShufflePieces}
                aria-label="Shuffle unscrambled pieces"
              >
                Shuffle pieces
              </button>
              <button
                type="button"
                className="puzzle-action puzzle-action-clear"
                onClick={handleClearPuzzle}
                aria-label="Clear puzzle and start over"
              >
                Clear puzzle
              </button>
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
                    setCompletionEventId((n) => n + 1)
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
                  forceCompleteSignal={forceCompleteSignal}
                  forceShuffleSignal={forceShuffleSignal}
                  forceClearSignal={forceClearSignal}
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
              <p className="puzzle-shell-caption">{copy.puzzleInstruction}</p>
              {isCompleted && (
                <p className="puzzle-shell-caption">{copy.completionCaption}</p>
              )}
            </section>
          </section>

          <aside
            className="layout-main-teaser"
            aria-label="About this experience"
          >
            {!isMobilePortrait && (
              <div className="neighborhood-panel">
                <NeighborhoodCard neighborhoodName={lastNeighborhood} variant="panel" />
              </div>
            )}
          </aside>
        </section>

        {isMobilePortrait && (
          <BottomSheet title={lastNeighborhood ?? 'Tap a neighborhood.'}>
            <NeighborhoodCard neighborhoodName={lastNeighborhood} variant="sheet" />
          </BottomSheet>
        )}

        {isCompletionModalOpen && (
          <div className="completion-modal-backdrop" role="presentation">
            <div
              className="completion-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="completion-modal-title"
            >
              <h2 id="completion-modal-title" className="completion-modal-title">
                {copy.modalTitle}
              </h2>
              {hasSubmittedEmail ? (
                <>
                  <p className="completion-modal-success" role="status">
                    {copy.alreadyOnListMessage}
                  </p>
                  <p className="completion-modal-body">{copy.alreadyOnListBody}</p>
                  <div className="completion-modal-actions">
                    <button
                      type="button"
                      className="completion-modal-secondary"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleClearPuzzle()
                      }}
                    >
                      {copy.startOverButton}
                    </button>
                    <button
                      type="button"
                      className="completion-modal-secondary"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setIsCompletionModalOpen(false)
                      }}
                    >
                      {copy.secondaryButton}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="completion-modal-body">{copy.modalBody}</p>
                  <form
                    className="completion-modal-form"
                    onSubmit={handleSubmitEmail}
                  >
                    <label className="completion-modal-label">
                      <span className="completion-modal-label-text">
                        {copy.emailLabel}
                      </span>
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
                      <button type="submit" disabled={emailStatus === 'submitting'}>
                        {emailStatus === 'submitting'
                          ? copy.submitButtonBusy
                          : copy.submitButton}
                      </button>
                      <button
                        type="button"
                        className="completion-modal-secondary"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleClearPuzzle()
                        }}
                      >
                        {copy.startOverButton}
                      </button>
                      <button
                        type="button"
                        className="completion-modal-secondary"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setIsCompletionModalOpen(false)
                        }}
                      >
                        {copy.secondaryButton}
                      </button>
                    </div>
                    {emailStatus === 'success' && (
                      <p className="completion-modal-success">{copy.successMessage}</p>
                    )}
                  </form>
                </>
              )}
              <p className="completion-modal-privacy">
                {copy.privacyNote}
              </p>
            </div>
          </div>
        )}

        <footer className="page-footer" role="contentinfo">
          <div className="page-footer-grid">
            <div className="page-footer-col">
              <h3 className="page-footer-col-title">Chicago Public Media</h3>
              <ul className="page-footer-links">
                <li>
                  <a
                    href="https://www.wbez.org/pages/public-financial-documents"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Public and Financial Documents
                  </a>
                </li>
                <li>
                  <a
                    href="https://wbez.org/about"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    About WBEZ
                  </a>
                </li>
                <li>
                  <a
                    href="http://suntimes.com/about"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    About the Sun-Times
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="page-footer-logo-wrap">
            <a
              href="https://www.chicagopublicmedia.org/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src="/cpm-logo-footer.svg"
                alt="Chicago Public Media"
                className="page-footer-logo"
                width={156}
                height={29}
              />
            </a>
          </div>
          <div className="page-footer-bottom">
            <div className="page-footer-copy-block">
              <p className="page-footer-copy">
                {copy.footerLine1.split('Chicago Public Media')[0]}
                <strong>Chicago Public Media</strong>
                {copy.footerLine1.split('Chicago Public Media')[1]}
              </p>
              <p className="page-footer-copy page-footer-copy--muted">
                {copy.footerLine2}
              </p>
            </div>
            <p className="page-footer-legal">
              <a
                href="https://www.chicagopublicmedia.org/terms"
                target="_blank"
                rel="noopener noreferrer"
              >
                Terms
              </a>
              {' · '}
              <a
                href="https://www.chicagopublicmedia.org/privacy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy
              </a>
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}

export default App
