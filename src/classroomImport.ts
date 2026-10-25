import { parseStudentName, type Speciality, type Student } from './roster'

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

export type RosterImportPreview = {
  added: Student[]
  updated: Student[]
  deactivated: Student[]
  issues: { name: string; reason: string }[]
  totalRows: number
  unchanged: Student[]
}

const ID_ALIASES = ['studentid', 'matricule', 'studentnumber', 'numeroinscription', 'id']
const NAME_ALIASES = ['name', 'fullname', 'studentname', 'nom', 'nomcomplet', 'nomdeleleve']
const EMAIL_ALIASES = ['email', 'emailaddress', 'studentemail', 'courriel', 'adresseemail', 'adressemail']

export function previewRosterImport(text: string, speciality: Speciality, currentRoster: Student[]): RosterImportPreview {
  const rows = parseDelimited(text.replace(/^\uFEFF/, ''))
  if (!rows.length) throw new Error('The file is empty.')

  const headers = rows[0]
  const idIndex = headerIndex(headers, ID_ALIASES)
  const nameIndex = headerIndex(headers, NAME_ALIASES)
  const emailIndex = headerIndex(headers, EMAIL_ALIASES)
  if (idIndex < 0) throw new Error('The file needs a Student ID column.')
  if (nameIndex < 0) throw new Error('The file needs a Name column.')

  // Older rosters use registration IDs internally while class CSVs use the
  // university number. Match either identifier and retain the internal ID so
  // attendance already recorded for that student still points to them.
  const existing = new Map<string, Student>()
  for (const student of currentRoster) {
    existing.set(student.id, student)
    if (student.matricule) existing.set(student.matricule, student)
  }
  const dataRows = rows.slice(1)
  const issues: RosterImportPreview['issues'] = []

  type Candidate = { id: string; lastName: string; firstName: string; email?: string }
  const candidates: Candidate[] = []

  for (const row of dataRows) {
    const id = (row[idIndex] || '').trim()
    const rawName = (row[nameIndex] || '').trim()
    const email = emailIndex >= 0 ? (row[emailIndex] || '').trim().toLowerCase() : ''
    const label = rawName || id || 'Unnamed row'

    if (!id) { issues.push({ name: label, reason: 'Missing Student ID' }); continue }
    if (!rawName) { issues.push({ name: id, reason: 'Missing name' }); continue }

    const { lastName, firstName } = parseStudentName(rawName)
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!validEmail) issues.push({ name: label, reason: 'Missing or invalid email' })

    candidates.push({ id, lastName, firstName, email: validEmail ? email : undefined })
  }

  // Reject duplicates within the file outright rather than guessing.
  const idCounts = new Map<string, number>()
  const emailCounts = new Map<string, number>()
  for (const candidate of candidates) {
    idCounts.set(candidate.id, (idCounts.get(candidate.id) || 0) + 1)
    if (candidate.email) emailCounts.set(candidate.email, (emailCounts.get(candidate.email) || 0) + 1)
  }

  const added: Student[] = []
  const updated: Student[] = []
  const seen = new Set<string>()

  for (const candidate of candidates) {
    if (idCounts.get(candidate.id)! > 1) {
      issues.push({ name: candidate.id, reason: 'Duplicate Student ID in the file' })
      continue
    }
    if (candidate.email && emailCounts.get(candidate.email)! > 1) {
      issues.push({ name: candidate.id, reason: 'Duplicate email in the file' })
      continue
    }
    const previous = existing.get(candidate.id)
    const stableId = previous?.id ?? candidate.id
    if (seen.has(stableId)) {
      issues.push({ name: candidate.id, reason: 'The same student appears twice in the file' })
      continue
    }
    seen.add(stableId)
    const next: Student = {
      id: stableId,
      ...(previous?.matricule ? { matricule: previous.matricule } : {}),
      lastName: candidate.lastName,
      firstName: candidate.firstName,
      email: candidate.email,
      speciality,
      active: true,
      badgeCode: previous?.badgeCode,
    }
    if (previous) updated.push(next)
    else added.push(next)
  }

  // Active students missing from the file are deactivated, never deleted.
  const deactivated = currentRoster
    .filter(student => student.active && !seen.has(student.id))
    .map(student => ({ ...student, active: false }))

  // Students already inactive and absent from the file are reported in neither
  // bucket, but must still survive the merge or their history is lost.
  const unchanged = currentRoster.filter(student => !student.active && !seen.has(student.id))

  return { added, updated, deactivated, unchanged, issues, totalRows: dataRows.length }
}

export function applyRosterImport(preview: RosterImportPreview): Student[] {
  const merged = new Map<string, Student>()
  for (const student of [
    ...preview.unchanged,
    ...preview.deactivated,
    ...preview.updated,
    ...preview.added,
  ]) {
    merged.set(student.id, student)
  }
  return [...merged.values()]
}
