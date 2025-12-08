import React, { useEffect } from 'react'

// Incremental migration: We mount a tiny React banner and keep legacy DOM intact for now.
// This ensures we introduce Vite + React without breaking existing features.

export default function App(){
  useEffect(() => {
    // Place for future migration side-effects if needed.
  }, [])

  return null;
}
