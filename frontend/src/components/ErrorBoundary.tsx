import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** Optional fallback message; default explains something went wrong and offers retry. */
  message?: string
}

type State = {
  hasError: boolean
  error: Error | null
}

/**
 * Catches render errors in the app and shows a friendly message with a retry button.
 * Prevents a single component failure from blanking the whole page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="page"
          role="alert"
          style={{
            padding: '2rem',
            maxWidth: '32rem',
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <p style={{ marginBottom: '1rem' }}>
            {this.props.message ??
              "Something went wrong. We're sorry for the inconvenience."}
          </p>
          <button type="button" onClick={this.handleRetry}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
