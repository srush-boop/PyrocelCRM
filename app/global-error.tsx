'use client'

import { useEffect } from 'react'

/**
 * Catastrophic fallback: catches errors thrown in the root layout itself,
 * which regular segment `error.tsx` boundaries cannot. Must render its own
 * <html>/<body>. Kept dependency-free (no design tokens/components) so it works
 * even if the app shell failed to load.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[v0] global error:', error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#fafafa',
          color: '#0a0a0a',
        }}
      >
        <div style={{ maxWidth: 420, padding: 32, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 24, lineHeight: 1.5 }}>
            The application ran into an unexpected error. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 500,
              color: '#fff',
              background: '#dc2626',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
