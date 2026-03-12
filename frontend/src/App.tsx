import './App.css'
import { useEffect, useState } from 'react'
import { PuzzleCanvas } from './components/PuzzleCanvas'
import { getOrCreateVisitorId, loadPuzzleState } from './persistence'
import {
  detectDeviceType,
  detectOrientation,
  initAnalytics,
  trackPuzzleCompleted,
  trackPuzzleStarted,
  trackPuzzleView,
  trackUserUuidCreated,
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

  return (
    <div className="page">
      <main className="page-inner">
        <header className="page-header">
          <div className="page-header-inner">
            <div className="page-title-block">
              <h1 className="page-title">Help us map Chicago together.</h1>
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
                  Puzzle complete. In a later phase, this will open a small
                  completion message and email capture.
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
