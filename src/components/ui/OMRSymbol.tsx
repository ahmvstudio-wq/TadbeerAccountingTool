import React from 'react'

interface OMRSymbolProps {
  className?: string
  style?: React.CSSProperties
  size?: number
}

export function OMRSymbol({ className = '', style = {}, size = 15 }: OMRSymbolProps) {
  return (
    <span 
      className={`inline-flex items-center justify-center ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        verticalAlign: 'middle',
        lineHeight: 1,
        ...style
      }}
    >
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 100 100" 
        fill="currentColor"
        style={{ display: 'block' }}
      >
        {/* Top calligraphic loop */}
        <path d="M42 45 C50 43, 62 38, 62 26 C62 14, 48 8, 38 8 C25 8, 18 18, 18 28 C18 42, 34 46, 44 46 C50 46, 54 42, 54 38 C54 32, 42 32, 38 24 C34 18, 38 14, 44 14 C52 14, 52 24, 52 28 C52 34, 46 40, 42 45 Z" />
        {/* Top slanted parallel bar */}
        <polygon points="20,48 94,48 84,62 10,62" />
        {/* Bottom slanted parallel bar */}
        <polygon points="12,68 86,68 76,82 2,82" />
      </svg>
    </span>
  )
}
