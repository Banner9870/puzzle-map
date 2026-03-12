import './App.css'
import { useState } from 'react'
import { PuzzleCanvas } from './components/PuzzleCanvas'

function App() {
  const [lastNeighborhood, setLastNeighborhood] = useState<string | null>(null)
  const [isCompleted, setIsCompleted] = useState(false)

  return (
    <div className="page">
      <main className="page-inner">
        <header className="page-header">
          <div className="page-title-block">
            <h1 className="page-title">Help us map Chicago together.</h1>
            <p className="page-subtitle">
              A jigsaw puzzle made from the city&apos;s neighborhoods — a small
              preview of what we&apos;re building with chicago.com.
            </p>
          </div>
        </header>

        <section className="layout-main" aria-label="Chicago puzzle">
          <section className="puzzle-shell">
            <div className="puzzle-shell-inner">
              <PuzzleCanvas
                onNeighborhoodTap={(name) => setLastNeighborhood(name)}
                onCompleted={() => setIsCompleted(true)}
              />
            </div>
            <p className="puzzle-shell-caption">
              Drag each neighborhood back into place to complete the map. Pieces
              will gently snap into the outline when you&apos;re close enough.
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
