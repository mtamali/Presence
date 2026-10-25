# Présence

A React attendance app for **1MAUT**, **1MESE**, and **4IGEI** in the 2026/27 academic year. The 58 students are imported from the three spreadsheets in `Listes 2627`.

## Run

```bash
npm install
npm run dev
```

Open the local address printed by Vite. Run `npm run build` to create a production build in `dist`.

## Teacher workflow

1. Open **Manage Student**, choose a speciality, and add or edit students. Use **Import CSV** for a class list with `Student ID`, `Name`, and optional `Email` columns. The preview shows additions, updates, and students who will be deactivated. University numbers in the CSV match the existing roster without changing attendance IDs.
2. Select a speciality and create a course session.
3. During a session, mark students present or absent in the attendance roster.
4. Close the session to mark unchecked students absent. Reopen it if corrections are needed; automatically marked absences return to unchecked.
5. Export the session as a CSV file for records.

Attendance and roster edits are stored in this browser on this device. They are not synced or protected by an account. Use **Analytics → Back up everything** to save a copy; clearing browser storage or uninstalling the app removes data that has not been backed up.

The local `1MAUT.csv` and generated `src/data/students.json` contain private student details and are excluded from Git. A fresh local build uses the generated roster; an existing device can import the CSV from **Manage Student** to update its saved roster.

Do not deploy the included roster publicly without adding authentication and appropriate data protection.

## Legacy badge attachments

The badge screen is currently disabled. The scripts below remain for preparing private badge images and Gmail draft plans. The **Python Avancé** Google Classroom roster (class code `rqzf77qf`) is not bundled with this project. Add student emails through **Manage Student → Import CSV**; importing does not email students.

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
