import { describe, it, expect } from 'vitest'

describe('harness', () => {
  it('runs and can reach localStorage', () => {
    localStorage.setItem('probe', 'ok')
    expect(localStorage.getItem('probe')).toBe('ok')
  })
})
