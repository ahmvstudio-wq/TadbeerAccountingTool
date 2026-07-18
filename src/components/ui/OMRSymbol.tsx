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
      <img 
        src="/omrsymbol.png"
        alt="OMR"
        style={{
          width: size * 1.8,
          height: size * 1.8,
          objectFit: 'contain',
          display: 'block',
          marginLeft: -size * 0.35,
          marginRight: -size * 0.28,
          transform: 'translateY(-2%)'
        }}
      />
    </span>
  )
}
