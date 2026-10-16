import { describe, it, expect } from 'vitest'
import { previewRosterImport, applyRosterImport } from './classroomImport'
import type { Student } from './roster'

function student(id: string, over: Partial<Student> = {}): Student {
  return { id, lastName: 'OLD', firstName: 'Name', speciality: '1MAUT', active: true, ...over }
}

const header = 'Student ID,Name,Email'

describe('previewRosterImport', () => {
  it('classifies a new student as added', () => {
    const preview = previewRosterImport(`${header}\n1,KERBEL Seddik,k@x.dz`, '1MAUT', [])
    expect(preview.added).toEqual([
      { id: '1', lastName: 'KERBEL', firstName: 'Seddik', email: 'k@x.dz', speciality: '1MAUT', active: true },
    ])
    expect(preview.updated).toEqual([])
    expect(preview.deactivated).toEqual([])
  })

  it('classifies a known id as updated and overwrites name and email', () => {
    const preview = previewRosterImport(`${header}\n1,NEW Name,n@x.dz`, '1MAUT', [student('1')])
    expect(preview.updated[0]).toMatchObject({ id: '1', lastName: 'NEW', firstName: 'Name', email: 'n@x.dz' })
    expect(preview.added).toEqual([])
  })

  it('reactivates a deactivated student present in the file', () => {
    const preview = previewRosterImport(`${header}\n1,A B,a@x.dz`, '1MAUT', [student('1', { active: false })])
    expect(preview.updated[0].active).toBe(true)
  })

  it('preserves an existing badgeCode on update', () => {
    const preview = previewRosterImport(`${header}\n1,A B,a@x.dz`, '1MAUT', [student('1', { badgeCode: 'ATD26-X' })])
    expect(preview.updated[0].badgeCode).toBe('ATD26-X')
  })

  it('deactivates a student missing from the file rather than deleting', () => {
    const preview = previewRosterImport(`${header}\n1,A B,a@x.dz`, '1MAUT', [student('1'), student('2')])
    expect(preview.deactivated.map(s => s.id)).toEqual(['2'])
    expect(preview.deactivated[0].active).toBe(false)
  })

  it('does not re-report an already inactive absent student', () => {
    const preview = previewRosterImport(`${header}\n1,A B,a@x.dz`, '1MAUT', [student('1'), student('2', { active: false })])
    expect(preview.deactivated).toEqual([])
  })

  it('adds the student but reports a missing email as an issue', () => {
    const preview = previewRosterImport(`${header}\n1,KERBEL Seddik,`, '1MAUT', [])
    expect(preview.added[0].email).toBeUndefined()
    expect(preview.issues[0].reason).toMatch(/email/i)
  })

  it('rejects a duplicate student id within the file', () => {
    const preview = previewRosterImport(`${header}\n1,A B,a@x.dz\n1,C D,c@x.dz`, '1MAUT', [])
    expect(preview.added).toEqual([])
    expect(preview.issues.some(i => /duplicate/i.test(i.reason))).toBe(true)
  })

  it('rejects a duplicate email within the file', () => {
    const preview = previewRosterImport(`${header}\n1,A B,same@x.dz\n2,C D,same@x.dz`, '1MAUT', [])
    expect(preview.added).toEqual([])
    expect(preview.issues.some(i => /duplicate/i.test(i.reason))).toBe(true)
  })

  it('rejects a row with no student id', () => {
    const preview = previewRosterImport(`${header}\n,A B,a@x.dz`, '1MAUT', [])
    expect(preview.added).toEqual([])
    expect(preview.issues.some(i => /id/i.test(i.reason))).toBe(true)
  })

  it('stamps every imported student with the target speciality', () => {
    const preview = previewRosterImport(`${header}\n1,A B,a@x.dz`, '4IGEI', [])
    expect(preview.added[0].speciality).toBe('4IGEI')
  })

  it('accepts semicolon delimiters and a BOM', () => {
    const preview = previewRosterImport(`\uFEFFStudent ID;Name;Email\n1;A B;a@x.dz`, '1MAUT', [])
    expect(preview.added.length).toBe(1)
  })

  it('accepts Matricule and Nom as column aliases', () => {
    const preview = previewRosterImport(`Matricule,Nom,Email\n1,A B,a@x.dz`, '1MAUT', [])
    expect(preview.added.length).toBe(1)
  })

  it('throws when the Student ID column is absent', () => {
    expect(() => previewRosterImport('Name,Email\nA B,a@x.dz', '1MAUT', [])).toThrow(/student id/i)
  })

  it('throws when the Name column is absent', () => {
    expect(() => previewRosterImport('Student ID,Email\n1,a@x.dz', '1MAUT', [])).toThrow(/name/i)
  })

  it('throws on an empty file', () => {
    expect(() => previewRosterImport('', '1MAUT', [])).toThrow(/empty/i)
  })

  it('counts data rows excluding the header', () => {
    expect(previewRosterImport(`${header}\n1,A B,a@x.dz\n2,C D,c@x.dz`, '1MAUT', []).totalRows).toBe(2)
  })
})

describe('applyRosterImport', () => {
  it('merges added, updated and deactivated into one roster', () => {
    const preview = previewRosterImport(`${header}\n1,A B,a@x.dz\n3,E F,e@x.dz`, '1MAUT', [student('1'), student('2')])
    const result = applyRosterImport(preview)
    expect(result.map(s => s.id).sort()).toEqual(['1', '2', '3'])
    expect(result.find(s => s.id === '2')!.active).toBe(false)
    expect(result.find(s => s.id === '3')!.active).toBe(true)
  })
})
