import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Camera, Check, Hash, RotateCcw, Users, X } from 'lucide-react'
import { getRoster, specialities, type Student } from '../../roster'
import type { AttendanceSession } from '../../sessions'
import { formatDate } from '../../format'

function normalizeBadge(value: string) {
  return value.trim().toUpperCase().replace(/\s/g, '')
}

// model.ts searched one flat array holding every student. Rosters are stored per
// speciality now, so the lookup walks all three: detecting a badge from the
// wrong class depends on finding students outside this session's speciality.
function findStudentByBadge(value: string): Student | undefined {
  const code = normalizeBadge(value)
  for (const item of specialities) {
    const match = getRoster(item.id).find(student => student.badgeCode === code)
    if (match) return match
  }
  return undefined
}

type ScanResult = { kind: 'ready' | 'unknown' | 'wrong-class' | 'already-present'; student?: Student; code: string }

// Dormant. Reachable only when BADGES_ENABLED is true, and lazy-loaded so
// html5-qrcode stays out of the entry chunk.
export default function ScannerModal({ session, onClose, onConfirm }: { session: AttendanceSession; onClose: () => void; onConfirm: (student: Student) => void }) {
  const [result, setResult] = useState<ScanResult | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [cameraError, setCameraError] = useState('')

  function resolveCode(code: string): ScanResult {
    const student = findStudentByBadge(code)
    if (!student) return { kind: 'unknown', code }
    if (student.speciality !== session.speciality) return { kind: 'wrong-class', code, student }
    if (session.entries[student.id]?.status === 'present') return { kind: 'already-present', code, student }
    return { kind: 'ready', code, student }
  }

  useEffect(() => {
    if (result) return
    let disposed = false
    let scanner: import('html5-qrcode').Html5Qrcode | null = null
    void (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (disposed) return
        scanner = new Html5Qrcode('qr-reader', { verbose: false })
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, code => {
          if (!disposed) setResult(resolveCode(code))
        }, undefined)
        if (disposed && scanner.isScanning) await scanner.stop()
      } catch {
        if (!disposed) setCameraError('Camera unavailable. Allow camera access or enter the badge code below.')
      }
    })()
    return () => {
      disposed = true
      void (async () => {
        try { if (scanner?.isScanning) await scanner.stop(); scanner?.clear() } catch { /* camera may already have stopped */ }
      })()
    }
    // A result stops the camera before the teacher confirms the student.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  function confirm() {
    if (!result?.student || result.kind !== 'ready') return
    onConfirm(result.student)
    setResult(null)
    setManualCode('')
  }
  function manualSubmit(event: FormEvent) {
    event.preventDefault()
    if (!manualCode.trim()) return
    setResult(resolveCode(manualCode))
  }

  return <div className="modal-backdrop scanner-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><div className="modal scanner-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-title"><div className="scanner-title-row"><div><p className="eyebrow small">Live check-in · {session.speciality}</p><h2 id="scanner-title">Scan student badge</h2><p>{session.course} · {formatDate(session.date)}</p></div><button className="icon-close" onClick={onClose} aria-label="Close scanner"><X size={22} /></button></div><div className="scanner-content"><div className="camera-area">{!result ? <><div className="camera-frame"><div id="qr-reader" /></div><div className="camera-caption"><Camera size={18} /> Hold a student badge inside the frame</div>{cameraError && <p className="camera-error">{cameraError}</p>}</> : <div className="scan-result">{result.student ? <><div className={result.kind === 'ready' ? 'scan-result-icon success' : 'scan-result-icon warning'}>{result.kind === 'ready' ? <Check size={33} /> : <Users size={31} />}</div><span className="result-label">{result.kind === 'ready' ? 'Badge found' : result.kind === 'wrong-class' ? 'Different speciality' : 'Already marked present'}</span><h3>{result.student.lastName} {result.student.firstName}</h3><p>{result.student.speciality} · Student ID {result.student.id}</p>{result.kind === 'wrong-class' && <div className="result-message">This badge belongs to {result.student.speciality}. Open a session for that speciality to record attendance.</div>}{result.kind === 'already-present' && <div className="result-message">This student is already present in this session.</div>}</> : <><div className="scan-result-icon danger"><X size={32} /></div><span className="result-label">Badge not recognized</span><h3>No student found</h3><p>Check the badge code and try again.</p></>}{result.kind === 'ready' ? <button className="button button-primary result-button" onClick={confirm}><Check size={18} /> Confirm presence</button> : <button className="button button-light result-button" onClick={() => { setResult(null); setManualCode('') }}><RotateCcw size={17} /> Scan another badge</button>}</div>}</div><div className="scanner-side"><div className="scan-step"><span>1</span><p>Ask the student to show their assigned QR badge.</p></div><div className="scan-step"><span>2</span><p>Scan the code and verify the name on screen.</p></div><div className="scan-step"><span>3</span><p>Confirm presence before scanning the next student.</p></div><div className="manual-entry"><div className="manual-entry-title"><Hash size={17} /> Enter code manually</div><p>Use this if the camera cannot read a badge.</p><form onSubmit={manualSubmit}><input aria-label="Badge code" placeholder="ATD26-..." value={manualCode} onChange={event => setManualCode(event.target.value)} /><button type="submit" aria-label="Check badge code"><ArrowRight size={19} /></button></form></div></div></div></div></div>
}
