import { useState, useRef, useEffect, useCallback } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { auth } from './firebase'
import Auth from './Auth'
import { MODES } from './modes'

const DEV_KEY = import.meta.env.VITE_OPENAI_API_KEY
const IS_DEV  = import.meta.env.DEV

// ── Stream OpenAI (via Netlify function in prod, direct in dev) ───────────────
async function streamChat({ system, messages, onChunk, onDone, onError }) {
  try {
    const res = IS_DEV
      ? await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEV_KEY}` },
          body: JSON.stringify({
            model: 'gpt-4o', stream: true,
            messages: [{ role: 'system', content: system }, ...messages.map(m => ({ role: m.role, content: m.text }))],
          }),
        })
      : await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system, messages }),
        })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || e.error || `Error ${res.status}`) }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n'); buf = lines.pop()
      for (const line of lines) {
        const t = line.replace(/^data: /, '').trim()
        if (!t || t === '[DONE]') continue
        try { const d = JSON.parse(t).choices?.[0]?.delta?.content; if (d) onChunk(d) } catch {}
      }
    }
    onDone()
  } catch (e) { onError(e.message) }
}

// ── Typing dots ───────────────────────────────────────────────────────────────
function Dots({ color }) {
  return (
    <div style={{ display:'flex', gap:'5px', alignItems:'center', padding:'4px 0' }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width:7, height:7, borderRadius:'50%', background: color,
          display:'block', animation:`blink 1.2s infinite`, animationDelay:`${i*0.18}s`
        }} />
      ))}
    </div>
  )
}

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button onClick={copy} title="Copy response" style={{
      position:'absolute', top:'8px', right:'8px',
      background: copied ? 'rgba(52,201,138,.15)' : '#161b25',
      border: `1px solid ${copied ? 'rgba(52,201,138,.4)' : '#1e2535'}`,
      color: copied ? '#34c98a' : '#3d4b65',
      width:28, height:28, borderRadius:'6px', cursor:'pointer',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:'.7rem', transition:'all .15s', flexShrink:0,
    }}>
      {copied ? '✓' : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      )}
    </button>
  )
}

// ── Chat message ──────────────────────────────────────────────────────────────
function Msg({ msg, mode, userName }) {
  const isUser = msg.role === 'user'
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display:'flex', gap:'10px', alignItems:'flex-start',
        flexDirection: isUser ? 'row-reverse' : 'row', animation:'fadeUp .2s ease' }}
    >
      {/* Avatar */}
      <div style={{
        width:32, height:32, borderRadius:'8px', flexShrink:0, marginTop:2,
        display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.85rem',
        background: isUser ? 'rgba(79,156,249,.15)' : '#161b25',
        border: `1px solid ${isUser ? 'rgba(79,156,249,.3)' : '#1e2535'}`,
        color: isUser ? '#4f9cf9' : mode.color, fontWeight:600,
      }}>
        {isUser ? (userName?.[0]?.toUpperCase() || 'U') : mode.emoji}
      </div>
      {/* Bubble */}
      <div style={{
        position:'relative',
        maxWidth: isUser ? '65%' : '100%', padding:'12px 16px',
        borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
        background: isUser ? 'rgba(79,156,249,.1)' : '#0f1117',
        border: `1px solid ${isUser ? 'rgba(79,156,249,.2)' : '#1e2535'}`,
        fontSize:'.9rem', lineHeight:1.65,
      }}>
        {isUser ? (
          <p style={{ color:'#e2e8f4', paddingRight: '4px' }}>{msg.text}</p>
        ) : msg.text === '' && msg.streaming ? (
          <Dots color={mode.color} />
        ) : (
          <>
            <div className="md" style={{ paddingRight: hovered ? '32px' : '0', transition:'padding .1s' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
            </div>
            {!msg.streaming && hovered && <CopyBtn text={msg.text} />}
          </>
        )}
      </div>
    </div>
  )
}

// ── Suggestion chips ──────────────────────────────────────────────────────────
function Chips({ mode, onSelect }) {
  const examples = mode.placeholder.split(', ').map(s => s.replace(/^e\.g\. /, ''))
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', justifyContent:'center', marginTop:'4px' }}>
      {examples.map((ex, i) => (
        <button key={i} onClick={() => onSelect(ex)} style={{
          background:'#0f1117', border:`1px solid ${mode.color}33`,
          color: mode.color, padding:'7px 14px', borderRadius:'20px',
          fontSize:'.8rem', cursor:'pointer', transition:'all .15s',
          fontFamily:'Sora, sans-serif',
        }}
          onMouseEnter={e => { e.target.style.background = `${mode.color}15`; e.target.style.borderColor = `${mode.color}66` }}
          onMouseLeave={e => { e.target.style.background = '#0f1117'; e.target.style.borderColor = `${mode.color}33` }}
        >
          {ex}
        </button>
      ))}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function Empty({ mode, onSelect }) {
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'center', gap:'16px', textAlign:'center', padding:'40px',
      animation:'fadeUp .4s ease' }}>
      <div style={{
        width:72, height:72, borderRadius:'18px',
        background:`${mode.color}10`, border:`1px solid ${mode.color}22`,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:'2.2rem', filter:`drop-shadow(0 0 18px ${mode.color}55)`,
        animation:'fadeUp .4s ease',
      }}>{mode.emoji}</div>
      <div>
        <h2 style={{ fontWeight:700, fontSize:'1.25rem', color:'#e2e8f4', marginBottom:'6px' }}>{mode.label} Mode</h2>
        <p style={{ color:'#7d8ba8', fontSize:'.875rem', maxWidth:'360px', lineHeight:1.6 }}>{mode.description}</p>
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'10px', marginTop:'4px' }}>
        <span style={{ fontSize:'.72rem', color:'#3d4b65', fontFamily:'JetBrains Mono', letterSpacing:'.06em' }}>TRY AN EXAMPLE</span>
        <Chips mode={mode} onSelect={onSelect} />
      </div>
    </div>
  )
}

// ── Scroll-to-bottom button ───────────────────────────────────────────────────
function ScrollBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{
      position:'absolute', bottom:'16px', right:'16px',
      width:36, height:36, borderRadius:'50%',
      background:'#161b25', border:'1px solid #2a3347',
      color:'#7d8ba8', cursor:'pointer',
      display:'flex', alignItems:'center', justifyContent:'center',
      boxShadow:'0 4px 16px rgba(0,0,0,.4)',
      animation:'fadeUp .2s ease', transition:'all .15s',
      zIndex:10,
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor='#4f9cf9'; e.currentTarget.style.color='#4f9cf9' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor='#2a3347'; e.currentTarget.style.color='#7d8ba8' }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser]         = useState(undefined)
  const [modeId, setModeId]     = useState('explain')
  const [chats, setChats]       = useState(() => Object.fromEntries(MODES.map(m => [m.id, []])))
  const [input, setInput]       = useState('')
  const [busy, setBusy]         = useState(false)
  const [sideOpen, setSide]     = useState(true)
  const [atBottom, setAtBottom] = useState(true)
  const bottomRef               = useRef(null)
  const scrollRef               = useRef(null)
  const taRef                   = useRef(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u && !u.emailVerified) { await signOut(auth); setUser(null) }
      else setUser(u ?? null)
    })
    return unsub
  }, [])

  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [chats, modeId, atBottom])

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = 'auto'
      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 150) + 'px'
    }
  }, [input])

  // Track scroll position to show/hide scroll button
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    setAtBottom(dist < 80)
  }, [])

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' })
    setAtBottom(true)
  }

  const mode = MODES.find(m => m.id === modeId)
  const msgs = chats[modeId]

  const send = useCallback(async (overrideText) => {
    const text = (typeof overrideText === 'string' ? overrideText : input).trim()
    if (!text || busy) return
    setAtBottom(true)
    const userMsg = { role:'user', text, id: Date.now() }
    const aiMsg   = { role:'assistant', text:'', streaming:true, id: Date.now()+1 }
    setChats(p => ({ ...p, [modeId]: [...p[modeId], userMsg, aiMsg] }))
    setInput(''); setBusy(true)
    const history = [...msgs, userMsg]
    await streamChat({
      system: mode.systemPrompt, messages: history,
      onChunk: chunk => setChats(p => {
        const t = [...p[modeId]]; const last = { ...t[t.length-1] }; last.text += chunk; t[t.length-1] = last
        return { ...p, [modeId]: t }
      }),
      onDone: () => { setChats(p => { const t=[...p[modeId]]; t[t.length-1]={...t[t.length-1],streaming:false}; return {...p,[modeId]:t} }); setBusy(false) },
      onError: e => { setChats(p => { const t=[...p[modeId]]; t[t.length-1]={...t[t.length-1],text:`⚠️ ${e}`,streaming:false}; return {...p,[modeId]:t} }); setBusy(false) },
    })
  }, [input, busy, modeId, mode, msgs])

  const onKey = (e) => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  // Loading
  if (user === undefined) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0a0c10' }}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'14px' }}>
        <div style={{ width:40, height:40, borderRadius:'10px', background:'linear-gradient(135deg,#4f9cf9,#2d6fd4)',
          display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:'1.2rem' }}>E</div>
        <div style={{ color:'#3d4b65', fontFamily:'JetBrains Mono', fontSize:'.75rem', letterSpacing:'.1em' }}>LOADING…</div>
      </div>
    </div>
  )

  if (!user) return <Auth />

  const initials = user.displayName?.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2) || user.email[0].toUpperCase()

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#0a0c10' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: sideOpen ? '260px' : '0px', minWidth: sideOpen ? '260px' : '0px',
        background:'#0f1117', borderRight:'1px solid #1e2535',
        display:'flex', flexDirection:'column', overflow:'hidden',
        transition:'all .25s ease',
      }}>
        {sideOpen && <>
          {/* Logo */}
          <div style={{ padding:'20px 20px 16px', borderBottom:'1px solid #1e2535' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <div style={{
                width:36, height:36, borderRadius:'8px', flexShrink:0,
                background:'linear-gradient(135deg,#4f9cf9,#2d6fd4)',
                color:'#fff', fontWeight:700, fontSize:'1.1rem',
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow:'0 6px 20px rgba(79,156,249,.3)',
              }}>E</div>
              <div>
                <div style={{ fontWeight:700, fontSize:'1rem', color:'#e2e8f4' }}>ExamAI</div>
                <div style={{ fontSize:'.62rem', color:'#3d4b65', letterSpacing:'.06em' }}>CS REVISION ASSISTANT</div>
              </div>
            </div>
          </div>

          {/* Mode tabs */}
          <nav style={{ flex:1, padding:'10px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'3px' }}>
            <div style={{ fontSize:'.6rem', color:'#3d4b65', letterSpacing:'.1em', padding:'4px 8px 8px', fontFamily:'JetBrains Mono' }}>REVISION MODES</div>
            {MODES.map(m => {
              const count = chats[m.id].length
              const active = modeId === m.id
              return (
                <button key={m.id} onClick={() => setModeId(m.id)} style={{
                  display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px',
                  borderRadius:'10px', border: active ? `1px solid ${m.color}22` : '1px solid transparent',
                  background: active ? `${m.color}0d` : 'none',
                  cursor:'pointer', textAlign:'left', width:'100%', transition:'all .15s',
                }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background='#161b25' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background='none' }}
                >
                  <span style={{
                    fontSize:'1rem', width:28, height:28, borderRadius:'7px',
                    background: active ? `${m.color}18` : '#161b25',
                    border: `1px solid ${active ? m.color+'33' : '#1e2535'}`,
                    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                    transition:'all .15s',
                  }}>{m.emoji}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'.85rem', fontWeight:600, color: active ? m.color : '#7d8ba8', transition:'color .15s' }}>{m.label}</div>
                    <div style={{ fontSize:'.71rem', color:'#3d4b65', lineHeight:1.3, marginTop:'1px',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.description}</div>
                  </div>
                  {count > 0 && (
                    <span style={{
                      fontSize:'.65rem', fontFamily:'JetBrains Mono',
                      background: active ? `${m.color}22` : '#161b25',
                      color: active ? m.color : '#3d4b65',
                      border:`1px solid ${active ? m.color+'33' : '#1e2535'}`,
                      padding:'1px 6px', borderRadius:'10px', flexShrink:0, transition:'all .15s',
                    }}>{count}</span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* User footer */}
          <div style={{ padding:'12px', borderTop:'1px solid #1e2535' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px',
              background:'#161b25', borderRadius:'10px', border:'1px solid #1e2535' }}>
              <div style={{ width:30, height:30, borderRadius:'7px', background:'rgba(79,156,249,.15)',
                border:'1px solid rgba(79,156,249,.25)', color:'#4f9cf9', fontWeight:700,
                fontSize:'.78rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {initials}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'.78rem', fontWeight:600, color:'#e2e8f4', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {user.displayName || 'Student'}
                </div>
                <div style={{ fontSize:'.65rem', color:'#3d4b65', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'JetBrains Mono' }}>
                  {user.email}
                </div>
              </div>
              <button onClick={() => signOut(auth)} title="Sign out" style={{
                background:'none', border:'1px solid #1e2535', color:'#3d4b65',
                width:26, height:26, borderRadius:'6px', cursor:'pointer', fontSize:'.85rem',
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                transition:'all .15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(239,68,68,.4)'; e.currentTarget.style.color='#f87171' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='#1e2535'; e.currentTarget.style.color='#3d4b65' }}
              >↪</button>
            </div>
            <div style={{ marginTop:'8px', display:'flex', alignItems:'center', gap:'6px', padding:'4px 4px' }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'#34c98a', boxShadow:'0 0 6px #34c98a' }} />
              <span style={{ fontSize:'.68rem', color:'#3d4b65', fontFamily:'JetBrains Mono' }}>GPT-4o</span>
            </div>
          </div>
        </>}
      </aside>

      {/* ── Main ── */}
      <main style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {/* Header */}
        <header style={{ display:'flex', alignItems:'center', gap:'12px', padding:'14px 20px',
          borderBottom:'1px solid #1e2535', background:'#0f1117', flexShrink:0,
          boxShadow:`0 1px 0 #1e2535, 0 4px 24px rgba(0,0,0,.2)` }}>
          <button onClick={() => setSide(p=>!p)} style={{
            background:'none', border:'1px solid #1e2535', color:'#7d8ba8',
            width:34, height:34, borderRadius:'8px', cursor:'pointer', fontSize:'.9rem',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
            transition:'all .15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='#2a3347'; e.currentTarget.style.color='#e2e8f4' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='#1e2535'; e.currentTarget.style.color='#7d8ba8' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          {/* Mode indicator */}
          <div style={{ display:'flex', alignItems:'center', gap:'10px', flex:1 }}>
            <div style={{
              width:36, height:36, borderRadius:'9px', flexShrink:0,
              background:`${mode.color}10`, border:`1px solid ${mode.color}25`,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.1rem',
            }}>{mode.emoji}</div>
            <div>
              <div style={{ fontWeight:700, fontSize:'1rem', color:'#e2e8f4', display:'flex', alignItems:'center', gap:'8px' }}>
                {mode.label}
                <span style={{ fontSize:'.65rem', color: mode.color, background:`${mode.color}15`,
                  border:`1px solid ${mode.color}25`, padding:'1px 7px', borderRadius:'10px',
                  fontFamily:'JetBrains Mono', letterSpacing:'.04em' }}>
                  {msgs.length > 0 ? `${msgs.length} msg${msgs.length !== 1 ? 's' : ''}` : 'Ready'}
                </span>
              </div>
              <div style={{ fontSize:'.75rem', color:'#7d8ba8' }}>{mode.description}</div>
            </div>
          </div>

          {msgs.length > 0 && (
            <button onClick={() => setChats(p=>({...p,[modeId]:[]}))} style={{
              background:'none', border:'1px solid #1e2535', color:'#3d4b65',
              padding:'7px 12px', borderRadius:'7px', cursor:'pointer',
              fontFamily:'JetBrains Mono', fontSize:'.72rem', transition:'all .15s',
              display:'flex', alignItems:'center', gap:'6px',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(239,68,68,.3)'; e.currentTarget.style.color='#f87171' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='#1e2535'; e.currentTarget.style.color='#3d4b65' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Clear
            </button>
          )}
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          style={{ flex:1, overflowY:'auto', padding:'24px', display:'flex', flexDirection:'column',
            gap:'18px', position:'relative' }}
        >
          {msgs.length === 0
            ? <Empty mode={mode} onSelect={(text) => { setInput(text); taRef.current?.focus() }} />
            : msgs.map(m => <Msg key={m.id} msg={m} mode={mode} userName={user.displayName} />)
          }
          <div ref={bottomRef} />
          {!atBottom && msgs.length > 0 && <ScrollBtn onClick={scrollToBottom} />}
        </div>

        {/* Input */}
        <div style={{ padding:'14px 20px 18px', borderTop:'1px solid #1e2535', background:'#0f1117', flexShrink:0 }}>
          <div style={{
            display:'flex', alignItems:'flex-end', gap:'10px',
            background:'#161b25',
            border:`1px solid ${busy ? mode.color+'55' : input.trim() ? '#2a3347' : '#1e2535'}`,
            borderRadius:'12px', padding:'10px 10px 10px 16px',
            transition:'border-color .2s',
            boxShadow: busy ? `0 0 0 3px ${mode.color}10` : 'none',
          }}>
            <textarea ref={taRef} rows={1} value={input}
              onChange={e=>setInput(e.target.value)} onKeyDown={onKey}
              placeholder={mode.placeholder} disabled={busy}
              style={{
                flex:1, background:'none', border:'none', outline:'none',
                color:'#e2e8f4', fontFamily:'Sora, sans-serif', fontSize:'.9rem',
                lineHeight:1.6, resize:'none', minHeight:'26px', maxHeight:'150px', overflowY:'auto',
              }}
            />
            <button onClick={send} disabled={!input.trim()||busy} style={{
              width:38, height:38, borderRadius:'9px', flexShrink:0, border:'none', cursor:'pointer',
              background: (!input.trim()||busy) ? '#1c2232' : `linear-gradient(135deg, ${mode.color}, ${mode.color}bb)`,
              color: (!input.trim()||busy) ? '#3d4b65' : '#fff',
              display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s',
              boxShadow: input.trim() && !busy ? `0 4px 14px ${mode.color}40` : 'none',
            }}>
              {busy
                ? <span style={{ width:16, height:16, border:'2px solid currentColor', borderTopColor:'transparent', borderRadius:'50%', display:'block', animation:'spin .7s linear infinite' }} />
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              }
            </button>
          </div>
          <div style={{ marginTop:'7px', fontSize:'.68rem', color:'#3d4b65', fontFamily:'JetBrains Mono',
            display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span>
              Press <kbd style={{ background:'#1c2232', border:'1px solid #1e2535', padding:'1px 5px', borderRadius:'3px' }}>Enter</kbd> to send · <kbd style={{ background:'#1c2232', border:'1px solid #1e2535', padding:'1px 5px', borderRadius:'3px' }}>Shift+Enter</kbd> for new line
            </span>
            {input.length > 60 && (
              <span style={{ color: input.length > 800 ? '#f87171' : '#3d4b65' }}>{input.length}</span>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
