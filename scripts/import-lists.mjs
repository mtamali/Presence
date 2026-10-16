import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const listsDir = join(root, 'Listes 2627')
const outFile = join(root, 'server', 'data', 'lists.json')

const SPECIALITIES = [
  { code: '1MAUT', file: '1MAUT.xlsx' },
  { code: '1MESE', file: '1MESE.xlsx' },
  { code: '4IGEI', file: '4IGEI.xlsx' }
]

const clean = (v) => (v == null ? '' : String(v).trim())

function parseList(spec) {
  const path = join(listsDir, spec.file)
  const wb = XLSX.readFile(path)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })

  const formation = clean(rows[0]?.[0]).replace(/^Offre de formation\s*:\s*/i, '')
  const semester = clean(rows[1]?.[0]).replace(/^Semestre\s*:\s*/i, '')
  const year = clean(rows[2]?.[0]).replace(/^Ann[ée]e Acad[ée]mique\s*:\s*/i, '')

  const headerIdx = rows.findIndex((r) => clean(r[0]).toLowerCase() === 'n°')
  if (headerIdx === -1) throw new Error(`${spec.file}: ligne d'en-tête "N°" introuvée`)

  const students = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    const matricule = clean(r[3])
    const nom = clean(r[4])
    const prenom = clean(r[5])
    if (!matricule && !nom) continue
    students.push({
      numeroInscription: clean(r[1]),
      anneeBac: clean(r[2]),
      matricule,
      nom,
      prenom,
      section: clean(r[6]) || 'Session1',
      groupe: clean(r[7]) || 'Groupe1'
    })
  }

  return {
    code: spec.code,
    formation: formation || spec.code,
    semester: semester || '',
    academicYear: year || '',
    students
  }
}

const data = SPECIALITIES.map(parseList)
mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify(data, null, 2) + '\n', 'utf8')

for (const s of data) {
  console.log(`${s.code}: ${s.students.length} étudiants — ${s.formation} (${s.semester}, ${s.academicYear})`)
}
console.log(`\nÉcrit : ${outFile}`)
