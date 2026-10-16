function isUpperToken(token: string) {
  // A token counts as uppercase only if it contains at least one cased
  // character and none of them are lowercase. This keeps digit-only tokens
  // (matricules) from being read as surnames.
  return token === token.toLocaleUpperCase() && token !== token.toLocaleLowerCase()
}

export function parseStudentName(value: string): { lastName: string; firstName: string } {
  const tokens = value.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { lastName: '', firstName: '' }
  if (tokens.length === 1) return { lastName: tokens[0], firstName: '' }

  let split = 0
  while (split < tokens.length && isUpperToken(tokens[split])) split++

  if (split === 0) split = 1                          // no uppercase lead
  if (split === tokens.length) split = tokens.length - 1  // all uppercase

  return {
    lastName: tokens.slice(0, split).join(' '),
    firstName: tokens.slice(split).join(' '),
  }
}
