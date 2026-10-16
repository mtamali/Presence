import { students, type Speciality } from './model'

export type ImportedEmail = {
  studentId: string
  studentName: string
  speciality: Speciality
  email: string
}

export type ImportPreview = {
  matches: ImportedEmail[]
  issues: { name: string; reason: string }[]
  totalRows: number
}

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function headerIndex(headers: string[], aliases: string[]) {
  return headers.findIndex(header => aliases.includes(normalized(header)))
}

function detectDelimiter(header: string) {
  const choices = [',', ';', '\t']
  return choices.sort((a, b) => header.split(b).length - header.split(a).length)[0]
}

function parseDelimited(text: string): string[][] {
  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0])
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const character = text[i]
    if (character === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++ }
      else quoted = !quoted
    } else if (character === delimiter && !quoted) {
      row.push(cell.trim()); cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim()); cell = ''
      if (row.some(value => value)) rows.push(row)
      row = []
    } else {
      cell += character
    }
  }
  row.push(cell.trim())
  if (row.some(value => value)) rows.push(row)
  return rows
}

export function previewClassroomImport(text: string): ImportPreview {
  const rows = parseDelimited(text.replace(/^\uFEFF/, ''))
  if (!rows.length) throw new Error('The file is empty.')
  const headers = rows[0]
  const emailIndex = headerIndex(headers, ['email', 'emailaddress', 'studentemail', 'courriel', 'adresseemail', 'adressemail'])
  const firstIndex = headerIndex(headers, ['firstname', 'givenname', 'prenom'])
  const lastIndex = headerIndex(headers, ['lastname', 'familyname', 'surname', 'nom', 'nomdefamille'])
  const fullIndex = headerIndex(headers, ['name', 'fullname', 'studentname', 'nomcomplet', 'nomdeleleve'])
  const matriculeIndex = headerIndex(headers, ['matricule', 'studentid', 'studentnumber', 'numeroinscription'])
  if (emailIndex < 0) throw new Error('The file needs an Email column.')
  if (fullIndex < 0 && (firstIndex < 0 || lastIndex < 0) && matriculeIndex < 0) {
    throw new Error('The file needs Name, First name and Last name, or Matricule columns.')
  }

  const candidates: ImportedEmail[] = []
  const issues: ImportPreview['issues'] = []
  const dataRows = rows.slice(1)
  for (const row of dataRows) {
    const email = (row[emailIndex] || '').trim().toLowerCase()
    const first = firstIndex >= 0 ? (row[firstIndex] || '').trim() : ''
    const last = lastIndex >= 0 ? (row[lastIndex] || '').trim() : ''
    const full = fullIndex >= 0 ? (row[fullIndex] || '').trim() : ''
    const matricule = matriculeIndex >= 0 ? (row[matriculeIndex] || '').trim() : ''
    const name = full || `${first} ${last}`.trim() || matricule || 'Unnamed row'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      issues.push({ name, reason: 'Missing or invalid email' })
      continue
    }
    const keys = [normalized(full), normalized(`${first} ${last}`), normalized(`${last} ${first}`)].filter(Boolean)
    const nameMatches = (student: (typeof students)[number]) =>
      keys.includes(normalized(`${student.firstName} ${student.lastName}`)) ||
      keys.includes(normalized(`${student.lastName} ${student.firstName}`))
    const found = students.filter(student => matricule
      ? student.matricule === matricule && (!keys.length || nameMatches(student))
      : nameMatches(student))
    if (found.length !== 1) {
      const numberExists = matricule && students.some(student => student.matricule === matricule)
      issues.push({ name, reason: found.length ? 'Multiple students match' : numberExists && keys.length ? 'Name and matricule do not match' : 'No matching student in the three specialities' })
      continue
    }
    const student = found[0]
    candidates.push({ studentId: student.id, studentName: `${student.lastName} ${student.firstName}`, speciality: student.speciality, email })
  }

  const idCounts = new Map<string, number>()
  const emailCounts = new Map<string, number>()
  for (const candidate of candidates) {
    idCounts.set(candidate.studentId, (idCounts.get(candidate.studentId) || 0) + 1)
    emailCounts.set(candidate.email, (emailCounts.get(candidate.email) || 0) + 1)
  }
  const matches: ImportedEmail[] = []
  for (const candidate of candidates) {
    if (idCounts.get(candidate.studentId)! > 1 || emailCounts.get(candidate.email)! > 1) {
      issues.push({ name: candidate.studentName, reason: 'Duplicate student or email in the file' })
    } else matches.push(candidate)
  }
  return { matches, issues, totalRows: dataRows.length }
}
