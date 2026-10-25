import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { saveRoster, type Student } from '../roster'
import { createSession } from '../sessions'
import { RosterList } from './RosterList'
import { SessionSummary } from './SessionSummary'

describe('badge and manual check-in controls', () => {
  beforeEach(() => localStorage.clear())

  it('offers an in-app scanner and a labeled manual fallback', () => {
    const student: Student = { id: 'A1', lastName: 'Example', firstName: 'Student', speciality: '1MAUT', active: true, badgeCode: 'ATD26-A1' }
    saveRoster('1MAUT', [student])
    const session = createSession({ specialities: ['1MAUT'], courseCode: 'AUT01', course: 'Automation', date: '2026-10-25', time: '09:00', room: '', teacher: '' })
    const summary = renderToStaticMarkup(<SessionSummary session={session} onScan={() => {}} onReopen={() => {}} onExport={() => {}} />)
    const props = { session, students: [student], search: '', filter: 'all' as const, classFilter: 'all' as const, onSearch: () => {}, onFilter: () => {}, onClassFilter: () => {}, onMarkAbsent: () => {}, onMarkPresentManually: () => {}, onCloseSession: () => {} }
    const roster = renderToStaticMarkup(<RosterList {...props} />)
    expect(summary).toContain('Scan student QR')
    expect(roster).toContain('Mark Example Student absent')
    expect(roster).toContain('Mark Example Student present manually')
    const checked = { ...session, entries: { A1: { status: 'present' as const, method: 'manual' as const, at: '2026-10-25T09:00:00Z' } } }
    expect(renderToStaticMarkup(<RosterList {...props} session={checked} />)).not.toContain('Mark Example Student present manually')
  })
})
