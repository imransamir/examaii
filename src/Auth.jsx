import { useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  signOut,
} from 'firebase/auth'
import { auth } from './firebase'

const ERROR_MAP = {
  'auth/email-already-in-use': 'This email is already registered. Please sign in.',
  'auth/invalid-email':        'Please enter a valid email address.',
  'auth/user-not-found':       'No account found with this email.',
  'auth/wrong-password':       'Incorrect password.',
  'auth/invalid-credential':   'Incorrect email or password.',
  'auth/too-many-requests':    'Too many attempts. Please wait a moment.',
  'auth/weak-password':        'Password must be at least 6 characters.',
}

export default function Auth() {
  const [tab, setTab]         = useState('login')   // 'login' | 'signup'
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [pass, setPass]       = useState('')
  const [err, setErr]         = useState('')
  const [busy, setBusy]       = useState(false)
  const [sent, setSent]       = useState(false)     // verification email sent

  const reset = (newTab) => { setTab(newTab); setErr(''); setName(''); setPass('') }

  const submit = async () => {
    setErr('')
    if (!email.trim() || !pass.trim()) return setErr('Please fill in all fields.')
    if (tab === 'signup' && !name.trim()) return setErr('Please enter your name.')
    if (pass.length < 6) return setErr('Password must be at least 6 characters.')

    setBusy(true)
    try {
      if (tab === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass)
        await updateProfile(cred.user, { displayName: name.trim() })
        await sendEmailVerification(cred.user)
        await signOut(auth)
        setSent(true)
      } else {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), pass)
        if (!cred.user.emailVerified) {
          await signOut(auth)
          setErr('Your email is not verified yet. Please check your inbox and click the verification link.')
        }
        // if verified, onAuthStateChanged in App.jsx will pick it up automatically
      }
    } catch (e) {
      setErr(ERROR_MAP[e.code] || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const onKey = (e) => { if (e.key === 'Enter') submit() }

  // ── Email sent screen ────────────────────────────────────────────────────
  if (sent) return (
    <div style={S.page}>
      <div style={S.card}>
        <Logo />
        <div style={S.sentBox}>
          <div style={S.sentIcon}>✉️</div>
          <h2 style={S.sentTitle}>Verify your email</h2>
          <p style={S.sentText}>
            We sent a link to <strong style={{color:'#4f9cf9'}}>{email}</strong>.
            Click it to activate your account, then come back and sign in.
          </p>
          <p style={S.sentHint}>Check your spam folder if you don't see it.</p>
          <button style={S.btn} onClick={() => { setSent(false); reset('login') }}>
            Go to Sign In
          </button>
        </div>
      </div>
    </div>
  )

  // ── Login / Signup form ──────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.card}>
        <Logo />

        {/* Tab switcher */}
        <div style={S.tabs}>
          <button style={{...S.tabBtn, ...(tab==='login'  ? S.tabActive : {})}} onClick={() => reset('login')}>Sign In</button>
          <button style={{...S.tabBtn, ...(tab==='signup' ? S.tabActive : {})}} onClick={() => reset('signup')}>Create Account</button>
        </div>

        {/* Fields */}
        <div style={S.fields}>
          {tab === 'signup' && (
            <Field label="Full Name" type="text" value={name}
              onChange={e => setName(e.target.value)} onKeyDown={onKey}
              placeholder="e.g. Mohamad Imran" />
          )}
          <Field label="Email Address" type="email" value={email}
            onChange={e => setEmail(e.target.value)} onKeyDown={onKey}
            placeholder="you@example.com" />
          <Field label="Password" type="password" value={pass}
            onChange={e => setPass(e.target.value)} onKeyDown={onKey}
            placeholder="At least 6 characters" />
        </div>

        {err && <div style={S.err}>⚠ {err}</div>}

        <button style={{...S.btn, opacity: busy ? 0.6 : 1}} onClick={submit} disabled={busy}>
          {busy ? 'Please wait…' : tab === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        <p style={S.switchLine}>
          {tab === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <span style={S.switchLink} onClick={() => reset(tab === 'login' ? 'signup' : 'login')}>
            {tab === 'login' ? 'Create one' : 'Sign in'}
          </span>
        </p>

        <p style={S.footer}>University College Birmingham · BSc Computer Science</p>
      </div>
    </div>
  )
}

// ── Small reusable field ─────────────────────────────────────────────────────
function Field({ label, type, ...props }) {
  const [focused, setFocused] = useState(false)
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  return (
    <div>
      <label style={S.label}>{label}</label>
      <div style={{ position:'relative' }}>
        <input
          {...props}
          type={isPassword && show ? 'text' : type}
          style={{ ...S.input, ...(focused ? S.inputFocus : {}), paddingRight: isPassword ? '42px' : '14px' }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            style={{
              position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)',
              background:'none', border:'none', cursor:'pointer', color: focused ? '#7d8ba8' : '#3d4b65',
              display:'flex', alignItems:'center', padding:'4px', transition:'color .15s',
            }}
          >
            {show ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Logo component ───────────────────────────────────────────────────────────
function Logo() {
  return (
    <div style={S.logo}>
      <div style={S.logoMark}>E</div>
      <div>
        <div style={S.logoName}>ExamAI</div>
        <div style={S.logoSub}>CS EXAM PREPARATION</div>
      </div>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: '#0a0c10',
    backgroundImage: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(79,156,249,0.06), transparent)',
    padding: '24px',
  },
  card: {
    width: '100%', maxWidth: '420px',
    background: '#0f1117', border: '1px solid #1e2535',
    borderRadius: '16px', padding: '36px',
    boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
    animation: 'fadeUp .3s ease',
  },
  logo: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' },
  logoMark: {
    width: '44px', height: '44px', borderRadius: '10px',
    background: 'linear-gradient(135deg, #4f9cf9, #2d6fd4)',
    color: '#fff', fontFamily: 'Sora, sans-serif', fontWeight: 700,
    fontSize: '1.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(79,156,249,0.3)',
  },
  logoName: { fontWeight: 700, fontSize: '1.15rem', color: '#e2e8f4', lineHeight: 1.2 },
  logoSub:  { fontSize: '.65rem', color: '#3d4b65', letterSpacing: '.08em', marginTop: '2px' },
  tabs: {
    display: 'flex', background: '#161b25', border: '1px solid #1e2535',
    borderRadius: '10px', padding: '4px', marginBottom: '24px',
  },
  tabBtn: {
    flex: 1, padding: '9px', border: 'none', background: 'none',
    borderRadius: '8px', fontFamily: 'Sora, sans-serif', fontSize: '.875rem',
    color: '#3d4b65', cursor: 'pointer', transition: 'all .15s',
  },
  tabActive: { background: '#1c2232', color: '#4f9cf9', fontWeight: 600 },
  fields:  { display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '14px' },
  label:   { display: 'block', fontSize: '.72rem', fontFamily: 'JetBrains Mono, monospace',
             color: '#7d8ba8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' },
  input: {
    width: '100%', background: '#161b25', border: '1px solid #1e2535',
    borderRadius: '10px', padding: '12px 14px', color: '#e2e8f4',
    fontFamily: 'Sora, sans-serif', fontSize: '.9rem', outline: 'none',
    transition: 'border-color .15s, box-shadow .15s',
  },
  inputFocus: { borderColor: '#4f9cf9', boxShadow: '0 0 0 3px rgba(79,156,249,.12)' },
  err: {
    background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)',
    borderRadius: '8px', padding: '10px 14px', color: '#f87171',
    fontSize: '.82rem', lineHeight: 1.5, marginBottom: '12px',
  },
  btn: {
    width: '100%', padding: '13px', background: 'linear-gradient(135deg, #4f9cf9, #2d6fd4)',
    color: '#fff', border: 'none', borderRadius: '10px', fontFamily: 'Sora, sans-serif',
    fontSize: '.95rem', fontWeight: 600, cursor: 'pointer',
    transition: 'opacity .15s, transform .1s', marginBottom: '16px',
  },
  switchLine: { textAlign: 'center', fontSize: '.82rem', color: '#3d4b65' },
  switchLink: { color: '#4f9cf9', cursor: 'pointer', textDecoration: 'underline' },
  footer: { textAlign: 'center', marginTop: '20px', fontSize: '.68rem',
            color: '#1e2535', fontFamily: 'JetBrains Mono, monospace' },
  sentBox:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' },
  sentIcon:  { fontSize: '2.5rem' },
  sentTitle: { fontSize: '1.2rem', fontWeight: 700, color: '#e2e8f4' },
  sentText:  { fontSize: '.85rem', color: '#7d8ba8', lineHeight: 1.6, maxWidth: '300px' },
  sentHint:  { fontSize: '.78rem', color: '#3d4b65' },
}
