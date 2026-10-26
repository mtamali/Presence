# Présence

A React attendance app for **1MAUT**, **1MESE**, and **4IGEI** in the 2026/27 academic year. The 58 students are imported from the three spreadsheets in `Listes 2627`.

## Run

```bash
npm install
npm run dev
```

Open the local address printed by Vite. Run `npm run build` to create a production build in `dist`.

## Teacher workflow

1. Open **Students Management**, filter by speciality, and add or edit students. Use **Import CSV** for a class list with `Student ID`, `Name`, and optional `Email` columns. The preview shows additions, updates, and students who will be deactivated. University numbers in the CSV match the existing roster without changing attendance IDs.
2. Select a speciality and create a course session.
3. During an open session, tap **Scan student QR** on the teacher phone. Each student shows the emailed badge image on their phone; scan it, verify the name, and confirm presence. If a student attends without a badge, search their name in the roster and use **Manual present** after confirming their identity. The app records whether check-in was by QR or manual and will not check the same student in twice. You can mark absence in the roster, or leave students unchecked until closing the session.
4. Close the session to mark unchecked students absent. Reopen it if corrections are needed; automatically marked absences return to unchecked.
5. Use **Export CSV** for the selected session's student list. Use **Export Attendance** on the attendance page for a CSV of every session, split by speciality and CR/TD/TP type, with student, present, absent, and unchecked counts. In open sessions, unchecked students are not counted absent.

Attendance and roster edits are stored in this browser on this device. They are not synced or protected by an account. Use **Analytics → Back up everything** to save a copy; clearing browser storage or uninstalling the app removes data that has not been backed up.

The local `1MAUT.csv` and generated `src/data/students.json` contain private student details and are excluded from Git. A fresh local build uses the generated roster; an existing device can import the CSV from **Students Management** to update its saved roster.

Do not deploy the included roster publicly without adding authentication and appropriate data protection.

## Send student badges

**Students Management → Send Badges** uses the current speciality, search and active-student filters. Review the student–email pairs, select recipients, then choose **Email badges**. Students without an email are skipped by email; **Review/share badges** lets you share or download their PNG badges one by one. Badge QR codes are assigned once and stored with the roster, including for newly imported students.

Automatic email is available in the local browser app through the Python mail bridge. Your SMTP password remains in the ignored `.env` file and is never bundled into the web or Android app. Set it up on your computer:

```bash
python -m pip install -r scripts/requirements.txt
cp -n .env.example .env
# If .env was missing, edit it with MAIL_USERNAME and MAIL_PASSWORD.
npm run mail:serve
```

In another terminal, run `npm run dev`. The mail bridge listens only on `127.0.0.1:8765`; the app reaches it through Vite's `/api/badges` proxy. It accepts requests only from the local development origins on ports 5173 and 5175. Check each selection before pressing **Email badges**. The result lists sent and failed recipients; if a request is interrupted, check your Sent folder before trying again.

The Android app can share badges through the device share sheet, but it cannot run this Python bridge or hold the SMTP password securely. Automatic email from Android requires a separately hosted, authenticated mail service reachable by the phone.

## Legacy badge attachments

The separate badge gallery is currently disabled. The scripts below remain for preparing private badge images and Gmail draft plans. The **Python Avancé** Google Classroom roster (class code `rqzf77qf`) is not bundled with this project. Add student emails through **Students Management → Import CSV**; importing does not email students.

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
