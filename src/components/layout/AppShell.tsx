'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { TopNav } from './TopNav'
import { ShieldAlert, LogIn, Lock, Mail, CheckCircle } from 'lucide-react'
import { useUIStore } from '@/store/ui'

const AUTHORIZED_EMAILS = ['w.taufiqq@gmail.com', 'operation@tadbeertt.com']

export function AppShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  // Zustand store triggers
  const setActiveCompany = useUIStore(state => state.setActiveCompany)
  const setUserRole = useUIStore(state => state.setUserRole)

  // Login Form States
  const [email, setEmail] = useState('operation@tadbeertt.com')
  const [password, setPassword] = useState('operationaccountingtadbeer2026')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [authChecking, setAuthChecking] = useState(false)

  // Load user companies and roles helper
  const syncUserSession = async (userSession: any) => {
    if (!userSession?.user) return
    const user = userSession.user
    
    // Check if membership records exist for the user
    let { data: memberships } = (await supabase
      .from('user_companies')
      .select('role, company:companies(id, name)')
      .eq('user_id', user.id)) as any

    // Auto-create default admin membership if none exists
    if (!memberships || memberships.length === 0) {
      const { error: insErr } = await supabase
        .from('user_companies')
        .insert({
          user_id: user.id,
          company_id: 'c0de0000-0000-0000-0000-000000000000', // Default company
          role: 'Admin',
        } as any)

      if (!insErr) {
        const { data: defaultMbs } = (await supabase
          .from('user_companies')
          .select('role, company:companies(id, name)')
          .eq('user_id', user.id)) as any
        memberships = defaultMbs
      }
    }

    if (memberships && memberships.length > 0) {
      const active = memberships[0]
      setActiveCompany(active.company.id, active.company.name)
      setUserRole(active.role as any)
    }
  }

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (initialSession?.user?.email && AUTHORIZED_EMAILS.includes(initialSession.user.email)) {
        setSession(initialSession)
        syncUserSession(initialSession)
      } else if (initialSession) {
        supabase.auth.signOut()
      }
      setLoading(false)
    })

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (currentSession?.user?.email && AUTHORIZED_EMAILS.includes(currentSession.user.email)) {
        setSession(currentSession)
        syncUserSession(currentSession)
      } else {
        setSession(null)
        setActiveCompany(null, null)
        setUserRole(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)

    const normalizedEmail = email.trim().toLowerCase()
    if (!AUTHORIZED_EMAILS.includes(normalizedEmail)) {
      setErrorMsg('Access Denied: This email address is not authorized.')
      return
    }

    setAuthChecking(true)
    try {
      // First, attempt to sign in
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })
      if (error) {
        // If sign in fails, attempt auto-signup
        if (password === 'operationaccountingtadbeer2026') {
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: normalizedEmail,
            password,
          })
          if (signUpError) {
            setErrorMsg(signUpError.message)
          } else if (signUpData.session) {
            setSession(signUpData.session)
            syncUserSession(signUpData.session)
          } else {
            setSuccessMsg('Account registered successfully. Please sign in now.')
          }
        } else {
          setErrorMsg(error.message)
        }
      } else if (data.session) {
        setSession(data.session)
        syncUserSession(data.session)
      }
    } catch {
      setErrorMsg('Authentication error. Please try again.')
    } finally {
      setAuthChecking(false)
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--color-bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div className="skeleton" style={{ width: 140, height: 40, borderRadius: 20 }} />
      </div>
    )
  }

  if (session) {
    return (
      <div className="app-shell">
        <TopNav />
        <main className="main-content">
          {children}
        </main>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      backgroundImage: 'radial-gradient(rgba(22, 59, 64, 0.04) 1px, transparent 1px)',
      backgroundSize: '24px 24px',
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)' }}>
        
        {/* Header */}
        <div className="card-header" style={{ flexDirection: 'column', gap: '0.5rem', alignItems: 'center', padding: '2rem 1.5rem 1.5rem' }}>
          <div style={{
            width: 48, height: 48,
            background: 'var(--color-teal-pale)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-teal)', marginBottom: '0.5rem'
          }}>
            <img src="/Logo .png" alt="Tadbeer" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-teal)', letterSpacing: '-0.02em' }}>
            Tadbeer Transformations
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
            Secure Corporate Portal. Authorized Personnel Only.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleAuth}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {errorMsg && (
              <div className="alert alert-danger" style={{ fontSize: '0.8rem', padding: '0.75rem 1rem' }}>
                <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="alert alert-success" style={{ fontSize: '0.8rem', padding: '0.75rem 1rem' }}>
                <CheckCircle size={16} style={{ flexShrink: 0 }} />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Email Field */}
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input
                  type="email" required
                  className="form-control"
                  placeholder="name@domain.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{ paddingLeft: 42 }}
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input
                  type="password" required
                  className="form-control"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ paddingLeft: 42 }}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <button
              type="submit"
              disabled={authChecking}
              className="btn btn-primary"
              style={{ width: '100%', height: 44, marginTop: '0.5rem', fontWeight: 700 }}
            >
              {authChecking ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <LogIn size={16} />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
