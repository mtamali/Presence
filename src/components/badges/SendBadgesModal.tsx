import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Check, Mail, QrCode, Send, X } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import type { Student } from '../../roster'
import { shareBadgePng, type SaveOutcome } from '../../native/share'
import { useDialog } from '../modals/useDialog'

function badgeImage(student: Student, qr: HTMLCanvasElement): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 700
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not draw this badge.')
  context.fillStyle = '#fffdfa'
  context.fillRect(0, 0, 1200, 700)
  context.fillStyle = '#2d211d'
  context.fillRect(0, 0, 1200, 122)
  context.fillStyle = '#ffffff'
  context.font = '700 44px Manrope, sans-serif'
  context.fillText('Présence', 62, 78)
  context.textAlign = 'right'
  context.font = '700 30px Manrope, sans-serif'
  context.fillText(student.speciality, 1138, 76)
  context.textAlign = 'left'
  context.fillStyle = '#8b5947'
  context.font = '700 27px Manrope, sans-serif'
  context.fillText('STUDENT BADGE · 2026/27', 62, 218)
  context.fillStyle = '#2d211d'
  const name = `${student.lastName} ${student.firstName}`.trim()
  let size = 68
  do { context.font = `800 ${size}px Manrope, sans-serif`; size -= 2 } while (context.measureText(name).width > 670 && size > 35)
  context.fillText(name, 62, 336)
  context.fillStyle = '#766c61'
  context.font = '500 30px Manrope, sans-serif'
  context.fillText(`Student ID  ${student.matricule || student.id}`, 62, 410)
  context.fillStyle = '#f3e9e2'
  context.fillRect(62, 480, 665, 2)
  context.fillStyle = '#766c61'
  context.font = '500 22px Manrope, sans-serif'
  context.fillText('Present this badge when attendance is recorded.', 62, 544)
  context.fillStyle = '#ffffff'
  context.fillRect(791, 171, 343, 343)
  context.drawImage(qr, 808, 188, 310, 310)
  context.fillStyle = '#766c61'
  context.textAlign = 'center'
  context.font = '500 17px Manrope, sans-serif'
  context.fillText(student.badgeCode || '', 963, 555)
  context.textAlign = 'left'
  context.fillStyle = '#eee0d5'
  context.fillRect(0, 628, 1200, 72)
  context.fillStyle = '#513e31'
  context.font = '600 22px Manrope, sans-serif'
  context.fillText('Présence · Student identity badge', 62, 673)
  return canvas.toDataURL('image/png')
}

export function SendBadgesModal({ students, scopeLabel, onClose }: {
  students: Student[]
  scopeLabel: string
  onClose: () => void
}) {
  const [selected, setSelected] = useState(() => new Set(students.map(student => student.id)))
  const [queue, setQueue] = useState<string[] | null>(null)
  const [index, setIndex] = useState(0)
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mailReady, setMailReady] = useState(false)
  const [mailNote, setMailNote] = useState('Checking email delivery…')
  const [mailBusy, setMailBusy] = useState(false)
  const [mailAttempted, setMailAttempted] = useState(false)
  const [mailResults, setMailResults] = useState<{ id: string; sent: boolean; error?: string }[] | null>(null)
  const qrRef = useRef<HTMLCanvasElement>(null)
  const closeIfIdle = () => { if (!mailBusy) onClose() }
  const dialog = useDialog(closeIfIdle)
  const current = queue ? students.find(student => student.id === queue[index]) : undefined
  const emailRecipients = students.filter(student => selected.has(student.id) && student.email)

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      setMailNote('Automatic email requires a connected mail server. You can share each badge from this device.')
      return
    }
    let live = true
    fetch('/api/badges/status').then(response => response.json()).then(status => {
      if (!live) return
      setMailReady(Boolean(status.ready))
      setMailNote(status.ready ? 'Mail settings found on this computer.' : status.reason || 'Mail credentials are not configured.')
    }).catch(() => { if (live) setMailNote('Start the local badge mail server to send emails.') })
    return () => { live = false }
  }, [])

  function toggle(id: string) {
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function shareCurrent() {
    if (!current || !qrRef.current) return
    setBusy(true)
    setError('')
    try {
      const image = badgeImage(current, qrRef.current)
      const number = (current.matricule || current.id).replace(/[^A-Za-z0-9._-]/g, '_')
      const result = await shareBadgePng(`${current.speciality}-${number}-badge.png`, image, current.email)
      if (result.ok) setOutcome(result.outcome)
      else setError(result.error)
    } catch {
      setError('The badge image could not be prepared. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function next() {
    setIndex(value => value + 1)
    setOutcome(null)
    setError('')
  }

  async function sendEmails() {
    if (!mailReady || !emailRecipients.length) return
    setMailAttempted(true)
    setMailBusy(true)
    setError('')
    try {
      const response = await fetch('/api/badges/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailRecipients),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Email delivery failed.')
      setMailResults(data.results)
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : 'Email delivery failed.'} Check Sent mail before trying again; some messages may have gone through.`)
    } finally {
      setMailBusy(false)
    }
  }

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeIfIdle() }}>
    <div className="modal send-badges-modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="send-badges-title">
      <div className="modal-header"><div className="modal-icon"><QrCode size={23} /></div><button className="icon-close" type="button" aria-label="Close" disabled={mailBusy} onClick={closeIfIdle}><X size={21} /></button></div>
      <h2 id="send-badges-title">Send Badges</h2>
      {!queue ? <>
        <p className="modal-subtitle">Choose students from {scopeLabel}. Badges are prepared one at a time so you can check each recipient before sharing.</p>
        <div className="badge-select-bar"><strong>{selected.size} of {students.length} selected</strong><button type="button" disabled={mailAttempted} onClick={() => setSelected(new Set(students.map(student => student.id)))}>Select all</button><button type="button" disabled={mailAttempted} onClick={() => setSelected(new Set())}>Clear</button></div>
        <div className="badge-recipient-list">{students.map(student => <label key={student.id} className="badge-recipient"><input type="checkbox" disabled={mailAttempted} checked={selected.has(student.id)} onChange={() => toggle(student.id)} /><span><strong>{student.lastName} {student.firstName}</strong><small>{student.speciality} · {student.matricule || student.id} · {student.email || 'No email — share manually'}</small></span></label>)}</div>
        <p className="badge-mail-note">{mailNote} {selected.size > emailRecipients.length && `${selected.size - emailRecipients.length} selected student(s) have no email and will be skipped by email.`}</p>
        {mailResults && <div className="badge-mail-results" role="status"><strong>{mailResults.filter(result => result.sent).length} sent · {mailResults.filter(result => !result.sent).length} failed</strong>{mailResults.map(result => <span key={result.id}>{result.sent ? '✓' : '✕'} {students.find(student => student.id === result.id)?.lastName} {students.find(student => student.id === result.id)?.firstName}{result.error ? ` — ${result.error}` : ''}</span>)}</div>}
        {error && <p className="modal-error" role="alert">{error}</p>}
        <div className="modal-actions"><button className="button button-light" type="button" disabled={mailBusy} onClick={onClose}>{mailResults ? 'Done' : 'Cancel'}</button><button className="button button-light" type="button" disabled={!selected.size || mailBusy} onClick={() => { setQueue(students.filter(student => selected.has(student.id)).map(student => student.id)); setIndex(0) }}><QrCode size={17} /> Review/share badges</button>{!mailAttempted && <button className="button button-primary" type="button" disabled={!mailReady || !emailRecipients.length || mailBusy} onClick={sendEmails}><Send size={17} /> {mailBusy ? 'Sending…' : `Email ${emailRecipients.length} ${emailRecipients.length === 1 ? 'badge' : 'badges'}`}</button>}</div>
      </> : current ? <>
        <p className="modal-subtitle">Badge {index + 1} of {queue.length}. Confirm this student's name and address in the sharing app before sending.</p>
        <div className="badge-send-preview"><div><strong>{current.lastName} {current.firstName}</strong><span>{current.speciality} · {current.matricule || current.id}</span><span>{current.email || 'No email on record'}</span></div><QRCodeCanvas ref={qrRef} value={current.badgeCode || ''} size={126} marginSize={4} level="M" /></div>
        {outcome === 'shared' && <p className="badge-send-result" role="status"><Check size={16} /> Badge handed to the sharing app. Delivery is not confirmed.</p>}
        {outcome === 'downloaded' && <p className="badge-send-result" role="status"><Check size={16} /> Badge downloaded. Attach it to your email before sending.</p>}
        {outcome === 'cancelled' && <p className="badge-send-result" role="status">Sharing was cancelled. You can try again.</p>}
        {error && <p className="modal-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="button button-light" type="button" onClick={() => { setQueue(null); setOutcome(null); setError('') }}>Back to students</button>
          {outcome === 'downloaded' && current.email && <a className="button button-light" href={`mailto:${encodeURIComponent(current.email)}?subject=${encodeURIComponent('Your Présence student badge')}&body=${encodeURIComponent('Hello,\n\nPlease find your student badge attached.\n')}`}><Mail size={17} /> Open email draft</a>}
          <button className="button button-primary" type="button" disabled={busy} onClick={shareCurrent}><Send size={17} /> {busy ? 'Preparing…' : 'Share badge'}</button>
          {outcome && outcome !== 'cancelled' && <button className="button button-light" type="button" onClick={index + 1 < queue.length ? next : onClose}>{index + 1 < queue.length ? 'Next student' : 'Done'}</button>}
        </div>
      </> : <div className="empty-table">This student is no longer in the selected list.</div>}
    </div>
  </div>
}
