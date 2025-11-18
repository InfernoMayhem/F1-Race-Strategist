import React, { useEffect } from 'react'

// Incremental migration: We mount a tiny React banner and keep legacy DOM intact for now.
// This ensures we introduce Vite + React without breaking existing features.

export default function App(){
  useEffect(() => {
    // Place for future migration side-effects if needed.
  }, [])

  return (
    <div style={{position:'fixed', right: 12, bottom: 12, fontSize: 12, opacity: 0.85, pointerEvents:'none'}}>
      <span style={{padding:'6px 10px', borderRadius: 999, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.2)'}}>React active (Vite)</span>
    </div>
  )
}
