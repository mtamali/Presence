# Présence

A React attendance app for **1MAUT**, **1MESE**, and **4IGEI** in the 2026/27 academic year. The 58 students are imported from the three spreadsheets in `Listes 2627`.

## Run

```bash
npm install
npm run dev
```

Open the local address printed by Vite. Run `npm run build` to create a production build in `dist`.

## Teacher workflow

1. Select a speciality and create a course session.
2. In **Student badges**, print the assigned QR badges or import a CSV roster with student emails. The import previews exact name or matricule matches and leaves unmatched rows untouched.
3. During a session, select **Scan a badge**. Check the matched student's name, then select **Confirm presence**. A badge from another speciality or a duplicate check-in is flagged. If the camera is unavailable, enter the badge code manually; the teacher can also mark a student in the roster.
4. Close the session to mark unchecked students absent. Reopen it if corrections are needed; automatically marked absences return to unchecked.
5. Export the session as a CSV file for records.

Attendance is stored in this browser on this device. It is not synced, backed up, or protected by an account. Export session CSV files regularly. Clearing browser storage removes saved sessions. Camera scanning requires browser camera permission and a secure context such as `localhost` or HTTPS.

The QR value is a random badge code rather than a name or university number. A photographed or copied badge can still be reused, so the teacher should compare the student's identity with the name displayed after scanning. Do not deploy the included roster publicly without adding authentication and appropriate data protection.

## Student email roster and badge attachments

The **Python Avancé** Google Classroom roster (class code `rqzf77qf`) is not bundled with this project. To add emails locally, open **Student badges → Import emails** and select a CSV or TSV file with an `Email` column plus either `Name`, `First name` and `Last name`, or `Matricule`. French column names such as `Nom`, `Prénom`, `Courriel`, and `Matricule` work too. Review the match preview before importing. Emails are saved only in this browser's local storage; importing does not email students.

### Preparing Gmail drafts

1. Obtain a roster for *Python Avancé* with a student name or matricule beside each email address. The 19-address `students.csv` in this folder has no identifying names, so it cannot be used to address badges. To complete those addresses, fill the `Name` or `Matricule` column in `generated/classroom-roster-to-complete.csv`. Google Classroom's People view can be used to verify the roster; this project does not assume it has a CSV download button.

   The [Ed-Fi Classroom extractor](https://pypi.org/project/edfi-google-classroom-extractor/) shown in the reference screenshot requires a Google Workspace administrator, a service account, and domain permissions. It is not required for this one-teacher workflow.

2. Generate badge images (requires `Pillow` and `qrcode`):

   ```bash
   python scripts/generate_badges.py
   ```

   This writes 58 PNGs under `generated/badges/` and a `generated/badge-manifest.csv`. The generated folder is ignored by Git because the badges are private student credentials.

3. Create a draft plan linking each student to their badge and email:

   ```bash
   python scripts/prepare_badge_drafts.py path/to/classroom-roster.csv
   ```

   The plan is saved as `generated/draft-plan.json`. It lists only exact student matches with their badge attachment and reports unmatched or conflicting rows. Review every student and recipient pairing. The plan does not create or send email. Gmail drafts can be created after the named roster is available and the connected Gmail account is accessible; each draft remains unsent for teacher review.

## Update the student lists

After changing one of the three source spreadsheets, run:

```bash
python scripts/import_rosters.py
```

This requires `openpyxl`. Existing badge codes are preserved for students with the same speciality and registration number; new students receive new random codes. Reprint badges when the roster changes.
