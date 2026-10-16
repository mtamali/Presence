import { describe, it, expect } from 'vitest'
import { parseStudentName } from './roster'

describe('parseStudentName', () => {
  it('splits a simple LASTNAME Firstname', () => {
    expect(parseStudentName('KERBEL Seddik')).toEqual({ lastName: 'KERBEL', firstName: 'Seddik' })
  })

  it('keeps a compound uppercase surname together', () => {
    expect(parseStudentName('BEN AMAR Youcef')).toEqual({ lastName: 'BEN AMAR', firstName: 'Youcef' })
  })

  it('falls back to first-token surname when nothing is uppercase', () => {
    expect(parseStudentName('Kerbel Seddik')).toEqual({ lastName: 'Kerbel', firstName: 'Seddik' })
  })

  it('treats the last token as given name when everything is uppercase', () => {
    expect(parseStudentName('KERBEL SEDDIK')).toEqual({ lastName: 'KERBEL', firstName: 'SEDDIK' })
  })

  it('handles a single token', () => {
    expect(parseStudentName('KERBEL')).toEqual({ lastName: 'KERBEL', firstName: '' })
  })

  it('does not mistake digits for an uppercase surname', () => {
    expect(parseStudentName('38000789 Seddik')).toEqual({ lastName: '38000789', firstName: 'Seddik' })
  })

  it('collapses irregular whitespace', () => {
    expect(parseStudentName('  KERBEL   Seddik  ')).toEqual({ lastName: 'KERBEL', firstName: 'Seddik' })
  })

  it('preserves accented uppercase surnames', () => {
    expect(parseStudentName('BENALÎ Chaïma')).toEqual({ lastName: 'BENALÎ', firstName: 'Chaïma' })
  })

  it('returns empty strings for empty input', () => {
    expect(parseStudentName('   ')).toEqual({ lastName: '', firstName: '' })
  })
})
