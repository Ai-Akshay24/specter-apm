/**
 * AuthScreen.jsx  —  Specter APM
 *
 * The gateway screen — renders before the dashboard if no valid JWT exists
 * in localStorage.  Toggles between Login and Register modes.
 *
 * ─── Visual language ──────────────────────────────────────────────────────────
 * Matches the existing Specter aesthetic established in ServerNode.jsx and
 * App.jsx: dark glass cards (rgba navy + backdrop-blur), cyan (#38bdf8)
 * accent glow, JetBrains Mono for labels/data, corner-bracket framing.
 * The card itself reuses the same "glass shell" recipe as ServerNode so the
 * auth screen feels like part of the same product, not a bolted-on form.
 *
 * ─── Auth contract ────────────────────────────────────────────────────────────
 * POST /api/auth/register  { email, password, name, orgName } → { token, user, org }
 * POST /api/auth/login     { email, password }                → { token, user }
 *
 * On success: localStorage.setItem('specter_token', token), then onAuthenticated(token, user)
 * is called so App.jsx can flip into the dashboard view without a full reload.
 *
 * Props
 * ─────
 * onAuthenticated(token, user)  — called after a successful login/register
 */

import { useState, useCallback, useRef, useEffect } from 'react'

const API_BASE = 'http://localhost:4000'

// ─── field config (keeps the render loop declarative) ─────────────────────────
const REGISTER_FIELDS = [
  { name: 'name',     label: 'Full name',         type: 'text',     autoComplete: 'name' },
  { name: 'orgName',  label: 'Organization name', type: 'text',     autoComplete: 'organization' },
  { name: 'email',    label: 'Work email',        type: 'email',    autoComplete: 'email' },
  { name: 'password', label: 'Password',          type: 'password', autoComplete: 'new-password' },
]

const LOGIN_FIELDS = [
  { name: 'email',    label: 'Email',    type: 'email',    autoComplete: 'email' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' },
]

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode]         = useState('login')   // 'login' | 'register'
  const [form, setForm]         = useState({ email: '', password: '', name: '', orgName: '' })
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const firstFieldRef           = useRef(null)

  const fields = mode === 'register' ? REGISTER_FIELDS : LOGIN_FIELDS

  // focus the first field whenever the mode switches — small but expected
  // UX detail on a SaaS gateway screen
  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [mode])

  const handleChange = useCallback((e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }, [])

  const handleModeToggle = useCallback((nextMode) => {
    setMode(nextMode)
    setError(null)
  }, [])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login'
    const payload  = mode === 'register'
      ? { email: form.email, password: form.password, name: form.name, orgName: form.orgName }
      : { email: form.email, password: form.password }

    try {
      const res  = await fetch(`${API_BASE}${endpoint}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error ?? 'Something went wrong. Please try again.')
      }

      // ── persist the JWT and hand control back to App.jsx ──────────────────
      localStorage.setItem('specter_token', data.token)
      localStorage.setItem('specter_user',  JSON.stringify(data.user))

      onAuthenticated?.(data.token, data.user)

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [mode, form, onAuthenticated])

  return (
    <div style={s.root}>
      {/* ── ambient background grid — echoes SpotlightCanvas without the JS engine ── */}
      <div style={s.bgGrid} aria-hidden="true" />
      <div style={s.bgGlow} aria-hidden="true" />

      <div style={s.card}>
        {/* corner accent marks — same language as ServerNode.jsx */}
        <span style={{ ...s.corner, ...s.cornerTL }} aria-hidden="true" />
        <span style={{ ...s.corner, ...s.cornerTR }} aria-hidden="true" />
        <span style={{ ...s.corner, ...s.cornerBL }} aria-hidden="true" />
        <span style={{ ...s.corner, ...s.cornerBR }} aria-hidden="true" />

        {/* ── logo / brand mark ── */}
        <div style={s.brand}>
          <span style={s.brandMark} aria-hidden="true">◈</span>
          <span style={s.brandName}>SPECTER</span>
        </div>
        <p style={s.brandTagline}>Application Performance Monitoring</p>

        {/* ── mode toggle ── */}
        <div style={s.toggleRow} role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            onClick={() => handleModeToggle('login')}
            style={{ ...s.toggleBtn, ...(mode === 'login' ? s.toggleBtnActive : {}) }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            onClick={() => handleModeToggle('register')}
            style={{ ...s.toggleBtn, ...(mode === 'register' ? s.toggleBtnActive : {}) }}
          >
            Create account
          </button>
        </div>

        {/* ── form ── */}
        <form onSubmit={handleSubmit} style={s.form}>
          {fields.map((field, i) => (
            <label key={field.name} style={s.fieldLabel}>
              <span style={s.fieldLabelText}>{field.label}</span>
              <input
                ref={i === 0 ? firstFieldRef : undefined}
                name={field.name}
                type={field.type}
                autoComplete={field.autoComplete}
                value={form[field.name]}
                onChange={handleChange}
                required
                minLength={field.name === 'password' ? 8 : undefined}
                style={s.input}
                onFocus={(e) => { e.target.style.borderColor = 'rgba(56,189,248,0.5)'; e.target.style.boxShadow = '0 0 0 3px rgba(56,189,248,0.1)' }}
                onBlur={(e)  => { e.target.style.borderColor = 'rgba(56,189,248,0.12)'; e.target.style.boxShadow = 'none' }}
              />
            </label>
          ))}

          {mode === 'register' && (
            <p style={s.helperText}>Password must be at least 8 characters.</p>
          )}

          {/* ── error banner ── */}
          {error && (
            <div style={s.errorBanner} role="alert">
              <span style={s.errorIcon} aria-hidden="true">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={loading} style={{ ...s.submitBtn, ...(loading ? s.submitBtnLoading : {}) }}>
            {loading
              ? <span style={s.spinner} aria-hidden="true" />
              : mode === 'register' ? 'Create account' : 'Sign in'}
            <span style={{ opacity: loading ? 0 : 1 }}>
              {loading ? '' : ''}
            </span>
          </button>
        </form>

        <p style={s.switchPrompt}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => handleModeToggle(mode === 'login' ? 'register' : 'login')}
            style={s.switchLink}
          >
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>

      <p style={s.footerNote}>Specter APM · Real-time server cluster telemetry</p>
    </div>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────
const s = {
  root: {
    position:        'relative',
    width:           '100vw',
    height:          '100vh',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: '#030712',
    fontFamily:      "'Inter', ui-sans-serif, sans-serif",
    overflow:        'hidden',
  },

  // ambient backdrop — static echo of the dashboard's dot-grid spotlight world
  bgGrid: {
    position:       'absolute',
    inset:           0,
    backgroundImage: 'radial-gradient(rgba(56,189,248,0.10) 1px, transparent 1px)',
    backgroundSize:  '36px 36px',
    maskImage:       'radial-gradient(ellipse 60% 50% at 50% 45%, black 0%, transparent 75%)',
    WebkitMaskImage: 'radial-gradient(ellipse 60% 50% at 50% 45%, black 0%, transparent 75%)',
    pointerEvents:   'none',
  },
  bgGlow: {
    position:       'absolute',
    top:            '50%',
    left:           '50%',
    width:          '700px',
    height:         '700px',
    transform:      'translate(-50%, -50%)',
    background:     'radial-gradient(circle, rgba(56,189,248,0.07) 0%, transparent 65%)',
    pointerEvents:  'none',
  },

  // ── card shell — mirrors ServerNode glass recipe ───────────────────────────
  card: {
    position:        'relative',
    width:           '380px',
    maxWidth:        'calc(100vw - 40px)',
    padding:         '32px 30px 26px',
    borderRadius:    '16px',
    border:          '1px solid rgba(56,189,248,0.12)',
    background:      'linear-gradient(160deg, rgba(15,23,42,0.92) 0%, rgba(7,14,30,0.97) 100%)',
    backdropFilter:  'blur(20px) saturate(1.4)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
    boxShadow:       '0 20px 60px rgba(0,0,0,0.65), 0 1px 0 rgba(255,255,255,0.04) inset',
    zIndex:          1,
  },

  corner: { position: 'absolute', width: '12px', height: '12px', pointerEvents: 'none' },
  cornerTL: { top: '10px', left: '10px', borderTop: '1.5px solid rgba(56,189,248,0.45)', borderLeft: '1.5px solid rgba(56,189,248,0.45)', borderRadius: '3px 0 0 0' },
  cornerTR: { top: '10px', right: '10px', borderTop: '1.5px solid rgba(56,189,248,0.45)', borderRight: '1.5px solid rgba(56,189,248,0.45)', borderRadius: '0 3px 0 0' },
  cornerBL: { bottom: '10px', left: '10px', borderBottom: '1.5px solid rgba(56,189,248,0.45)', borderLeft: '1.5px solid rgba(56,189,248,0.45)', borderRadius: '0 0 0 3px' },
  cornerBR: { bottom: '10px', right: '10px', borderBottom: '1.5px solid rgba(56,189,248,0.45)', borderRight: '1.5px solid rgba(56,189,248,0.45)', borderRadius: '0 0 3px 0' },

  // ── brand header ─────────────────────────────────────────────────────────
  brand: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            '8px',
    marginBottom:   '4px',
  },
  brandMark: {
    fontSize: '22px',
    color:    '#38bdf8',
    filter:   'drop-shadow(0 0 8px rgba(56,189,248,0.6))',
  },
  brandName: {
    fontSize:      '17px',
    fontWeight:    700,
    letterSpacing: '0.18em',
    color:         '#e2e8f0',
  },
  brandTagline: {
    margin:        0,
    marginBottom:  '24px',
    textAlign:     'center',
    fontSize:      '10px',
    letterSpacing: '0.10em',
    color:         'rgba(100,116,139,0.75)',
    fontFamily:    "'JetBrains Mono', ui-monospace, monospace",
  },

  // ── mode toggle ──────────────────────────────────────────────────────────
  toggleRow: {
    display:        'flex',
    gap:             '4px',
    padding:         '4px',
    marginBottom:    '22px',
    borderRadius:    '10px',
    background:      'rgba(7,14,30,0.7)',
    border:          '1px solid rgba(56,189,248,0.08)',
  },
  toggleBtn: {
    flex:           1,
    padding:        '9px 0',
    border:         'none',
    borderRadius:   '7px',
    background:     'transparent',
    color:          'rgba(148,163,184,0.6)',
    fontSize:       '12px',
    fontWeight:     600,
    letterSpacing:  '0.04em',
    cursor:         'pointer',
    fontFamily:     'inherit',
    transition:     'background 0.2s, color 0.2s',
  },
  toggleBtnActive: {
    background: 'rgba(56,189,248,0.12)',
    color:      '#38bdf8',
    boxShadow:  '0 0 0 1px rgba(56,189,248,0.18) inset',
  },

  // ── form ─────────────────────────────────────────────────────────────────
  form: {
    display:        'flex',
    flexDirection:  'column',
    gap:            '14px',
  },
  fieldLabel: {
    display:        'flex',
    flexDirection:  'column',
    gap:            '6px',
  },
  fieldLabelText: {
    fontSize:      '10px',
    fontWeight:    600,
    letterSpacing: '0.10em',
    textTransform: 'uppercase',
    color:         'rgba(148,163,184,0.65)',
    fontFamily:    "'JetBrains Mono', ui-monospace, monospace",
  },
  input: {
    width:           '100%',
    padding:         '10px 12px',
    fontSize:        '13px',
    color:           '#e2e8f0',
    background:      'rgba(7,14,30,0.75)',
    border:          '1px solid rgba(56,189,248,0.12)',
    borderRadius:    '8px',
    outline:         'none',
    fontFamily:      'inherit',
    boxSizing:       'border-box',
    transition:      'border-color 0.2s, box-shadow 0.2s',
  },
  helperText: {
    margin:        '-6px 0 0',
    fontSize:      '10px',
    color:         'rgba(100,116,139,0.6)',
    letterSpacing: '0.02em',
  },

  // ── error banner ─────────────────────────────────────────────────────────
  errorBanner: {
    display:        'flex',
    alignItems:     'flex-start',
    gap:            '8px',
    padding:        '10px 12px',
    borderRadius:   '8px',
    background:     'rgba(239,68,68,0.08)',
    border:         '1px solid rgba(239,68,68,0.22)',
    color:          '#fca5a5',
    fontSize:       '12px',
    lineHeight:     1.4,
  },
  errorIcon: { color: '#ef4444', flexShrink: 0, marginTop: '1px' },

  // ── submit button ────────────────────────────────────────────────────────
  submitBtn: {
    marginTop:       '4px',
    padding:         '11px 0',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '8px',
    border:          'none',
    borderRadius:    '8px',
    background:      'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)',
    color:           '#031021',
    fontSize:        '13px',
    fontWeight:      700,
    letterSpacing:   '0.04em',
    cursor:          'pointer',
    fontFamily:      'inherit',
    boxShadow:       '0 4px 20px rgba(56,189,248,0.35)',
    transition:      'transform 0.15s, box-shadow 0.15s, opacity 0.15s',
  },
  submitBtnLoading: {
    opacity:        0.75,
    cursor:         'wait',
  },
  spinner: {
    width:           '14px',
    height:          '14px',
    border:          '2px solid rgba(3,16,33,0.3)',
    borderTopColor:  '#031021',
    borderRadius:    '50%',
    animation:       'specter-spin 0.7s linear infinite',
  },

  // ── footer ───────────────────────────────────────────────────────────────
  switchPrompt: {
    marginTop:     '18px',
    textAlign:     'center',
    fontSize:      '12px',
    color:         'rgba(100,116,139,0.7)',
  },
  switchLink: {
    background:    'none',
    border:        'none',
    padding:       0,
    color:         '#38bdf8',
    fontSize:      '12px',
    fontWeight:    600,
    cursor:        'pointer',
    fontFamily:    'inherit',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  footerNote: {
    position:      'relative',
    marginTop:     '22px',
    fontSize:      '10px',
    letterSpacing: '0.08em',
    color:         'rgba(71,85,105,0.6)',
    fontFamily:    "'JetBrains Mono', ui-monospace, monospace",
    zIndex:        1,
  },
}

/*
 * ─── REQUIRED: spinner keyframe ──────────────────────────────────────────────
 * Add to your global stylesheet alongside the existing specter-ping keyframe:
 *
 *   @keyframes specter-spin {
 *     to { transform: rotate(360deg); }
 *   }
 */