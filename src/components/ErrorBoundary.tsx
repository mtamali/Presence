import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Without a boundary, one throw anywhere in render or in a commit-phase effect
 * unmounts the React root, and the teacher is left looking at a blank page
 * mid-lecture with no way to tell a crash from a dead battery. This keeps
 * something on screen that names what happened and offers the one action that
 * recovers: a reload, which re-reads the last state that reached storage.
 *
 * It is a class because that is still the only way to catch a render error in
 * React 18 — there is no hook equivalent.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Nothing collects logs off a teacher's phone, so the console is the only
    // place this can go — but it is what makes a reported crash diagnosable.
    console.error('Présence crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="crash-panel" role="alert">
        <h1>Something went wrong</h1>
        <p>
          Présence stopped responding. Reloading brings back everything that reached
          storage; anything marked in the last few moments may need entering again.
        </p>
        <button className="button button-primary" onClick={() => window.location.reload()}>
          Reload Présence
        </button>
      </div>
    )
  }
}
