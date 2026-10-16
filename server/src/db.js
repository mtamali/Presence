import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(here, '..', 'data')
const dbFile = process.env.DB_FILE || join(dataDir, 'abscence.db')
const listsFile = join(dataDir, 'lists.json')

export const STATUSES = ['present', 'absent', 'excused']

export const db = new DatabaseSync(dbFile)

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS specialities (
    code          TEXT PRIMARY KEY,
    formation     TEXT NOT NULL,
    semester      TEXT NOT NULL DEFAULT '',
    academic_year TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS students (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    speciality         TEXT NOT NULL REFERENCES specialities(code) ON DELETE CASCADE,
    numero_inscription TEXT NOT NULL DEFAULT '',
    annee_bac          TEXT NOT NULL DEFAULT '',
    matricule          TEXT NOT NULL,
    nom                TEXT NOT NULL,
    prenom             TEXT NOT NULL DEFAULT '',
    section            TEXT NOT NULL DEFAULT '',
    groupe             TEXT NOT NULL DEFAULT '',
    UNIQUE (speciality, matricule)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    speciality  TEXT NOT NULL REFERENCES specialities(code) ON DELETE CASCADE,
    module      TEXT NOT NULL,
    date        TEXT NOT NULL,
    note        TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    status     TEXT CHECK (status IN ('present','absent','excused')),
    UNIQUE (session_id, student_id)
  );

  CREATE INDEX IF NOT EXISTS idx_students_speciality ON students(speciality);
  CREATE INDEX IF NOT EXISTS idx_sessions_speciality_date ON sessions(speciality, date);
  CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
`)

const emptyStatus = () => Object.fromEntries(STATUSES.map((s) => [s, 0]))

export function listSpecialities() {
  return db
    .prepare(
      `SELECT s.code, s.formation, s.semester, s.academic_year AS academicYear,
              (SELECT COUNT(*) FROM students st WHERE st.speciality = s.code) AS studentCount
         FROM specialities s ORDER BY s.code`
    )
    .all()
    .map((r) => ({ ...r, studentCount: Number(r.studentCount) }))
}

export function listStudents(speciality) {
  return db
    .prepare(
      `SELECT id, speciality, numero_inscription AS numeroInscription, annee_bac AS anneeBac,
              matricule, nom, prenom, section, groupe
         FROM students WHERE speciality = ? ORDER BY nom COLLATE NOCASE, prenom COLLATE NOCASE`
    )
    .all(speciality)
}

export function listSessions({ speciality, from, to } = {}) {
  const where = []
  const params = []
  if (speciality) {
    where.push('se.speciality = ?')
    params.push(speciality)
  }
  if (from) {
    where.push('se.date >= ?')
    params.push(from)
  }
  if (to) {
    where.push('se.date <= ?')
    params.push(to)
  }
  const sql = `
    SELECT se.id, se.speciality, se.module, se.date, se.note, se.created_at AS createdAt,
           (SELECT COUNT(*) FROM attendance a WHERE a.session_id = se.id AND a.status IS NOT NULL) AS marked,
           (SELECT COUNT(*) FROM attendance a WHERE a.session_id = se.id AND a.status = 'present') AS present,
           (SELECT COUNT(*) FROM attendance a WHERE a.session_id = se.id AND a.status = 'absent')  AS absent,
           (SELECT COUNT(*) FROM attendance a WHERE a.session_id = se.id AND a.status = 'excused') AS excused,
           (SELECT COUNT(*) FROM students st WHERE st.speciality = se.speciality) AS students
      FROM sessions se
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY se.date DESC, se.id DESC`
  return db.prepare(sql).all(...params).map((r) => ({ ...r, marked: Number(r.marked), present: Number(r.present), absent: Number(r.absent), excused: Number(r.excused), students: Number(r.students) }))
}

export function getSession(id) {
  const session = db
    .prepare(`SELECT id, speciality, module, date, note, created_at AS createdAt FROM sessions WHERE id = ?`)
    .get(id)
  if (!session) return null
  const students = listStudents(session.speciality).map((s) => ({ ...s, status: null }))
  const rows = db.prepare(`SELECT student_id AS studentId, status FROM attendance WHERE session_id = ?`).all(id)
  const byStudent = new Map(rows.map((r) => [Number(r.studentId), r.status]))
  for (const s of students) s.status = byStudent.get(s.id) ?? null
  const counts = emptyStatus()
  let unmarked = 0
  for (const s of students) {
    if (s.status) counts[s.status]++
    else unmarked++
  }
  return { ...session, students, counts: { ...counts, unmarked, total: students.length } }
}

export function createSession({ speciality, module, date, note = '' }) {
  const info = db
    .prepare(`INSERT INTO sessions (speciality, module, date, note) VALUES (?, ?, ?, ?)`)
    .run(speciality, module, date, note)
  const sessionId = Number(info.lastInsertRowid)
  const students = listStudents(speciality)
  const ins = db.prepare(`INSERT OR IGNORE INTO attendance (session_id, student_id, status) VALUES (?, ?, NULL)`)
  for (const s of students) ins.run(sessionId, s.id)
  return sessionId
}

export function updateSession(id, patch) {
  const current = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id)
  if (!current) return null
  const next = {
    module: patch.module ?? current.module,
    date: patch.date ?? current.date,
    note: patch.note ?? current.note
  }
  db.prepare(`UPDATE sessions SET module = ?, date = ?, note = ? WHERE id = ?`).run(next.module, next.date, next.note, id)
  if (patch.speciality && patch.speciality !== current.speciality) throw new Error('La spécialité ne peut pas être modifiée')
  return getSession(id)
}

export function setAttendance(sessionId, items) {
  const exists = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(sessionId)
  if (!exists) return null
  const stmt = db.prepare(
    `INSERT INTO attendance (session_id, student_id, status) VALUES (?, ?, ?)
       ON CONFLICT(session_id, student_id) DO UPDATE SET status = excluded.status`
  )
  for (const item of items) {
    stmt.run(sessionId, Number(item.studentId), item.status ?? null)
  }
  return getSession(sessionId)
}

export function stats({ speciality, from, to } = {}) {
  const where = []
  const params = []
  if (speciality) {
    where.push('se.speciality = ?')
    params.push(speciality)
  }
  if (from) {
    where.push('se.date >= ?')
    params.push(from)
  }
  if (to) {
    where.push('se.date <= ?')
    params.push(to)
  }
  const cond = where.length ? 'AND ' + where.join(' AND ') : ''
  const rows = db
    .prepare(
      `SELECT st.id AS studentId, st.speciality, st.matricule, st.nom, st.prenom,
              COUNT(DISTINCT se.id) AS sessions,
              SUM(CASE WHEN a.status = 'present'  THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN a.status = 'absent'   THEN 1 ELSE 0 END) AS absent,
              SUM(CASE WHEN a.status = 'excused'  THEN 1 ELSE 0 END) AS excused,
              SUM(CASE WHEN a.status IS NULL      THEN 1 ELSE 0 END) AS unmarked
         FROM students st
         JOIN sessions se ON se.speciality = st.speciality ${cond}
         LEFT JOIN attendance a ON a.session_id = se.id AND a.student_id = st.id
        GROUP BY st.id
        ORDER BY st.speciality, st.nom COLLATE NOCASE, st.prenom COLLATE NOCASE`
    )
    .all(...params)
    .map((r) => {
      const present = Number(r.present || 0)
      const absent = Number(r.absent || 0)
      const excused = Number(r.excused || 0)
      const unmarked = Number(r.unmarked || 0)
      const marked = present + absent + excused
      return {
        studentId: Number(r.studentId),
        speciality: r.speciality,
        matricule: r.matricule,
        nom: r.nom,
        prenom: r.prenom,
        sessions: Number(r.sessions || 0),
        present,
        absent,
        excused,
        unmarked,
        marked,
        rate: marked ? Math.round((present / marked) * 1000) / 10 : null
      }
    })

  const perSpeciality = {}
  for (const row of rows) {
    const agg = (perSpeciality[row.speciality] ||= { students: 0, present: 0, absent: 0, excused: 0, unmarked: 0 })
    agg.students++
    agg.present += row.present
    agg.absent += row.absent
    agg.excused += row.excused
    agg.unmarked += row.unmarked
  }
  return { students: rows, perSpeciality }
}

export function seedFromLists() {
  if (!existsSync(listsFile)) {
    console.warn(`[seed] ${listsFile} introuvable — aucun import de listes effectué`)
    return { imported: false }
  }
  const data = JSON.parse(readFileSync(listsFile, 'utf8'))
  let imported = 0
  const seen = new Set()
  const upsertSpeciality = db.prepare(
    `INSERT INTO specialities (code, formation, semester, academic_year) VALUES (?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET formation = excluded.formation, semester = excluded.semester, academic_year = excluded.academic_year`
  )
  const upsertStudent = db.prepare(
    `INSERT INTO students (speciality, numero_inscription, annee_bac, matricule, nom, prenom, section, groupe)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(speciality, matricule) DO UPDATE SET
         numero_inscription = excluded.numero_inscription,
         annee_bac = excluded.annee_bac,
         nom = excluded.nom,
         prenom = excluded.prenom,
         section = excluded.section,
         groupe = excluded.groupe`
  )
  for (const spec of data) {
    upsertSpeciality.run(spec.code, spec.formation, spec.semester, spec.academicYear)
    for (const s of spec.students) {
      upsertStudent.run(spec.code, s.numeroInscription, s.anneeBac, s.matricule, s.nom, s.prenom, s.section, s.groupe)
      seen.add(`${spec.code}::${s.matricule}`)
      imported++
    }
  }
  const existing = db.prepare(`SELECT id, speciality, matricule FROM students`).all()
  for (const s of existing) {
    if (!seen.has(`${s.speciality}::${s.matricule}`)) {
      const used = db.prepare(`SELECT COUNT(*) AS n FROM attendance WHERE student_id = ?`).get(s.id).n
      if (Number(used) === 0) db.prepare(`DELETE FROM students WHERE id = ?`).run(s.id)
    }
  }
  return { imported: true, students: imported, specialities: data.length }
}
