'use client'
import { useState, useEffect, useRef } from 'react'
import { Search, ChevronDown, X } from 'lucide-react'
import type { Ledger } from '@/lib/types'

interface SearchableSelectProps {
  ledgers: Ledger[]
  value: string
  onChange: (val: string) => void
  placeholder?: string
  error?: boolean
  disabled?: boolean
}

export function SearchableSelect({
  ledgers,
  value,
  onChange,
  placeholder = 'Select Account...',
  error = false,
  disabled = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync selected ledger name to search box when closed, or clear search
  const selectedLedger = ledgers.find(l => l.id === value)

  useEffect(() => {
    // Close on click outside
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = ledgers.filter(ledger => {
    const term = search.toLowerCase()
    const nameMatch = ledger.name.toLowerCase().includes(term)
    const codeMatch = (ledger.account_code || '').toLowerCase().includes(term)
    const natureMatch = (ledger.group?.nature || '').toLowerCase().includes(term)
    const classMatch = (ledger.classification || '').toLowerCase().includes(term)
    return nameMatch || codeMatch || natureMatch || classMatch
  })

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Control Box */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 44,
          padding: '0 1rem',
          border: error ? '1.5px solid var(--color-danger)' : '1.5px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          background: disabled ? 'var(--color-bg-alt)' : 'var(--color-surface)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          transition: 'all var(--t-fast)',
          boxShadow: isOpen ? '0 0 0 4px rgba(22, 59, 64, 0.07)' : 'none',
          borderColor: isOpen ? 'var(--color-teal)' : error ? 'var(--color-danger)' : 'var(--color-border)',
        }}
      >
        <span style={{ fontSize: '0.9rem', color: selectedLedger ? 'var(--color-text)' : 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedLedger ? (
            <>
              <strong style={{ color: 'var(--color-gold-dark)', marginRight: 6 }}>
                [{selectedLedger.account_code}]
              </strong>
              {selectedLedger.name}
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: 8 }}>
                ({selectedLedger.group?.nature || 'Account'} - {selectedLedger.classification})
              </span>
            </>
          ) : (
            placeholder
          )}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {selectedLedger && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onChange('')
                setSearch('')
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: 'var(--color-bg-alt)',
                color: 'var(--color-text-muted)',
              }}
            >
              <X size={12} />
            </button>
          )}
          <ChevronDown size={16} style={{ color: 'var(--color-text-muted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>
      </div>

      {/* Dropdown Options */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Search Input inside Dropdown */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.5rem 0.75rem',
              borderBottom: '1px solid var(--color-border-light)',
              background: 'var(--color-surface-alt)',
            }}
          >
            <Search size={15} style={{ color: 'var(--color-text-muted)', marginRight: 8 }} />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Search account code, name, nature..."
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '0.85rem',
                color: 'var(--color-text)',
                height: 30,
              }}
            />
          </div>

          {/* Options List */}
          <div style={{ maxHeight: 240, overflowY: 'auto', padding: '0.25rem 0' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                No matching accounts found
              </div>
            ) : (
              filtered.map((ledger) => {
                const isSelected = ledger.id === value
                return (
                  <div
                    key={ledger.id}
                    onClick={() => {
                      onChange(ledger.id)
                      setIsOpen(false)
                      setSearch('')
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 1rem',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--color-teal-pale)' : 'transparent',
                      color: isSelected ? 'var(--color-teal)' : 'var(--color-text)',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = 'var(--color-surface-alt)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                        <span style={{ color: 'var(--color-gold-dark)', marginRight: 6 }}>
                          [{ledger.account_code}]
                        </span>
                        {ledger.name}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                        Group: {ledger.group?.name || 'Unassigned'} ({ledger.group?.nature}) • Classification: {ledger.classification}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
