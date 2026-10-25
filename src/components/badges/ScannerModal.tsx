import { useEffect, useRef, useState } from 'react'
import { Camera, Check, RotateCcw, Users, X } from 'lucide-react'
import { getRoster, specialities, type Student } from '../../roster'
import type { AttendanceSession } from '../../sessions'
import { formatDate } from '../../format'
import { useDialog } from '../modals/useDialog'

function findStudentByBadge(code: string): Student | undefined {
  for (const item of specialities) {
    const match = getRoster(item.id).find(student => student.badgeCode === code)
    if (match) return match
  }
  return undefined
}

type ScanResult = { kind: 'ready' | 'unknown' | 'wrong-class' | 'not-in-session' | 'already-present'; student?: Student; code: string }

function resolveCode(value: string, session: AttendanceSession): ScanResult {
  const code = value.trim().toUpperCase()
  const student = findStudentByBadge(code)
  if (!student) return { kind: 'unknown', code }
  if (!session.specialities.includes(student.speciality)) return { kind: 'wrong-class', code, student }
  if (!student.active || !session.rosterIds.includes(student.id)) return { kind: 'not-in-session', code, student }
  if (session.entries[student.id]?.status === 'present') return { kind: 'already-present', code, student }
  return { kind: 'ready', code, student }
}

export default function ScannerModal({ session, onClose, onConfirm }: {
  session: AttendanceSession
  onClose: () => void
  onConfirm: (student: Student, code: string) => boolean
}) {
  const [result, setResult] = useState<ScanResult | null>(null)
  const [cameraError, setCameraError] = useState('')
  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null)
  const resultRef = useRef<ScanResult | null>(null)
  const confirmedIds = useRef(new Set<string>())
  const sessionRef = useRef(session)
  sessionRef.current = session
  const dialog = useDialog(onClose)

  useEffect(() => {
    let disposed = false
    void (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (disposed) return
        const scanner = new Html5Qrcode('qr-reader', { verbose: false })
        scannerRef.current = scanner
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, value => {
          if (disposed || resultRef.current) return
          const next = resolveCode(value, sessionRef.current)
          if (next.student && confirmedIds.current.has(next.student.id)) next.kind = 'already-present'
          resultRef.current = next
          scanner.pause(true)
          setResult(next)
        }, undefined)
        if (disposed && scanner.isScanning) await scanner.stop()
      } catch {
        if (!disposed) setCameraError('Camera unavailable. Allow camera access in device settings; a QR scan is required for presence.')
      }
    })()
    return () => {
      disposed = true
      void (async () => {
        const scanner = scannerRef.current
        try { if (scanner?.isScanning) await scanner.stop(); scanner?.clear() } catch { /* Camera may already have stopped. */ }
      })()
    }
  }, [])

  function reset() {
    resultRef.current = null
    setResult(null)
    if (scannerRef.current?.isScanning) scannerRef.current.resume()
  }

  function confirm() {
    if (!result?.student || result.kind !== 'ready') return
    if (!onConfirm(result.student, result.code)) return
    confirmedIds.current.add(result.student.id)
    reset()
  }

  return <div className="modal-backdrop scanner-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal scanner-modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="scanner-title">
      <div className="scanner-title-row"><div><p className="eyebrow small">Live check-in · {session.specialities.join(' · ')}</p><h2 id="scanner-title">Scan student badge</h2><p>{session.course} · {formatDate(session.date)}</p></div><button className="icon-close" type="button" onClick={onClose} aria-label="Close scanner"><X size={22} /></button></div>
      <div className="scanner-content">
        <div className="camera-area">
          <div className="camera-frame" style={{ display: result ? 'none' : undefined }}><div id="qr-reader" /></div>
          {!result && <><div className="camera-caption"><Camera size={18} /> Hold the student's phone inside the frame</div>{cameraError && <p className="camera-error" role="alert">{cameraError}</p>}</>}
          {result && <div className="scan-result">{result.student ? <><div className={result.kind === 'ready' ? 'scan-result-icon success' : 'scan-result-icon warning'}>{result.kind === 'ready' ? <Check size={33} /> : <Users size={31} />}</div><span className="result-label">{result.kind === 'ready' ? 'Badge found' : result.kind === 'wrong-class' ? 'Different speciality' : result.kind === 'not-in-session' ? 'Not in this session' : 'Already marked present'}</span><h3>{result.student.lastName} {result.student.firstName}</h3><p>{result.student.speciality} · Student ID {result.student.id}</p>{result.kind === 'wrong-class' && <div className="result-message">This badge belongs to {result.student.speciality}. Open a session for that speciality.</div>}{result.kind === 'not-in-session' && <div className="result-message">This student is not active in this session's roster.</div>}{result.kind === 'already-present' && <div className="result-message">This student is already present in this session.</div>}</> : <><div className="scan-result-icon danger"><X size={32} /></div><span className="result-label">Badge not recognized</span><h3>No student found</h3><p>Ask the student to show their assigned badge and try again.</p></>}{result.kind === 'ready' ? <button className="button button-primary result-button" onClick={confirm}><Check size={18} /> Confirm presence</button> : <button className="button button-light result-button" onClick={reset}><RotateCcw size={17} /> Scan another badge</button>}</div>}
        </div>
        <div className="scanner-side"><div className="scan-step"><span>1</span><p>Ask the student to open the badge image on their phone.</p></div><div className="scan-step"><span>2</span><p>Scan the QR code and verify the name on screen.</p></div><div className="scan-step"><span>3</span><p>Confirm presence, then scan the next student.</p></div></div>
      </div>
    </div>
  </div>
}
