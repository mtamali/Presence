import { describe, expect, it } from 'vitest'
import { assignMissingBadgeCodes } from './badges'
import type { Student } from './roster'

const student = (id: string, badgeCode?: string): Student => ({
  id, lastName: 'Example', firstName: id, speciality: '1MAUT', active: true, badgeCode,
})

describe('assignMissingBadgeCodes', () => {
  it('preserves issued codes and gives distinct opaque codes to new students', () => {
    const existing = 'ATD26-1234567890ABCDEF'
    const roster = assignMissingBadgeCodes([student('1', existing), student('2'), student('3')], [existing])
    expect(roster[0].badgeCode).toBe(existing)
    expect(roster[1].badgeCode).toMatch(/^ATD26-[0-9A-F]{16}$/)
    expect(new Set(roster.map(item => item.badgeCode)).size).toBe(3)
    expect(assignMissingBadgeCodes(roster, [existing])).toEqual(roster)
  })
})
