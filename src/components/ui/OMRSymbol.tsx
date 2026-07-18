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
        <path fillRule="evenodd" d="M 32,48 C 22,38 20,20 32,10 C 44,0 60,4 66,16 C 72,28 72,42 68,48 L 58,48 C 61,42 61,32 55,22 C 49,12 38,12 36,22 C 34,32 36,42 38,48 Z" />
        {/* Top slanted parallel bar */}
        <polygon points="20,48 94,48 84,62 10,62" />
        {/* Bottom slanted parallel bar */}
        <polygon points="12,68 86,68 76,82 2,82" />
      </svg>
    </span>
  )
}
