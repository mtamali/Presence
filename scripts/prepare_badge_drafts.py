"""Match a named email roster to students and prepare a reviewable draft plan.

This script never connects to Gmail or sends mail. Its output is kept in generated/.
"""

import argparse
import csv
import html
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STUDENTS = json.loads((ROOT / "src" / "data" / "students.json").read_text(encoding="utf-8"))
OUTPUT = ROOT / "generated" / "draft-plan.json"


def normalize(value: str) -> str:
    plain = unicodedata.normalize("NFKD", value).casefold()
    return "".join(character for character in plain if character.isascii() and character.isalnum())


def column(headers: list[str], *names: str) -> str | None:
    aliases = {normalize(name) for name in names}
    return next((header for header in headers if normalize(header) in aliases), None)


def student_name_matches(student: dict, full: str, first: str, last: str) -> bool:
    provided = {normalize(value) for value in (full, f"{first} {last}", f"{last} {first}") if value.strip()}
    return normalize(f"{student['firstName']} {student['lastName']}") in provided or normalize(f"{student['lastName']} {student['firstName']}") in provided


def read_roster(path: Path) -> tuple[list[dict], list[dict], int]:
    contents = path.read_text(encoding="utf-8-sig")
    header = contents.splitlines()[0] if contents.splitlines() else ""
    delimiter = max((",", ";", "\t"), key=header.count)
    reader = csv.DictReader(contents.splitlines(), delimiter=delimiter)
    headers = reader.fieldnames or []
    email_key = column(headers, "email", "email address", "student email", "courriel", "adresse email")
    first_key = column(headers, "first name", "given name", "prénom", "prenom")
    last_key = column(headers, "last name", "family name", "surname", "nom", "nom de famille")
    full_key = column(headers, "name", "full name", "student name", "nom complet", "nom de l'élève")
    number_key = column(headers, "matricule", "student id", "student number", "numero inscription")
    if not email_key or not (full_key or (first_key and last_key) or number_key):
        raise ValueError("Roster needs an Email column and a Name, First name + Last name, or Matricule column.")

    matches: list[dict] = []
    issues: list[dict] = []
    count = 0
    for row_number, row in enumerate(reader, start=2):
        if not any((value or "").strip() for value in row.values() if isinstance(value, str)):
            continue
        count += 1
        email = (row.get(email_key) or "").strip().lower()
        first = (row.get(first_key) or "").strip() if first_key else ""
        last = (row.get(last_key) or "").strip() if last_key else ""
        full = (row.get(full_key) or "").strip() if full_key else ""
        number = (row.get(number_key) or "").strip() if number_key else ""
        label = full or " ".join(part for part in (first, last) if part) or number or f"Row {row_number}"
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            issues.append({"row": row_number, "name": label, "reason": "Missing or invalid email"})
            continue
        has_name = bool(full or first or last)
        candidates = [student for student in STUDENTS if
                      (student["matricule"] == number if number else True) and
                      (student_name_matches(student, full, first, last) if has_name else True)]
        if not number and not has_name:
            candidates = []
        if len(candidates) != 1:
            number_exists = bool(number and any(student["matricule"] == number for student in STUDENTS))
            reason = "Multiple students match" if candidates else "Name and matricule do not match" if number_exists and has_name else "No matching student"
            issues.append({"row": row_number, "name": label, "reason": reason})
            continue
        matches.append({"student": candidates[0], "email": email, "row": row_number})

    student_counts = Counter(item["student"]["id"] for item in matches)
    email_counts = Counter(item["email"] for item in matches)
    unique_matches = []
    for item in matches:
        if student_counts[item["student"]["id"]] > 1 or email_counts[item["email"]] > 1:
            issues.append({"row": item["row"], "name": item["student"]["lastName"] + " " + item["student"]["firstName"], "reason": "Duplicate student or email"})
        else:
            unique_matches.append(item)
    return unique_matches, issues, count


def make_draft(item: dict) -> dict:
    student = item["student"]
    badge_file = ROOT / "generated" / "badges" / student["speciality"] / f"{student['matricule']}.png"
    if not badge_file.is_file():
        raise FileNotFoundError(f"Badge image missing: {badge_file}. Run generate_badges.py first.")
    name = html.escape(student["firstName"])
    body = (f"<p>Bonjour {name},</p>"
            "<p>Votre badge QR de présence est joint à ce message. "
            "Présentez-le à l’enseignant lors de chaque séance pour confirmer votre présence.</p>"
            "<p>Ce badge est personnel. Merci de ne pas le partager.</p>"
            "<p>Cordialement</p>")
    return {
        "to": item["email"],
        "student": f"{student['lastName']} {student['firstName']}",
        "speciality": student["speciality"],
        "matricule": student["matricule"],
        "subject": "Votre badge QR de présence — Python Avancé",
        "html_body": body,
        "attachment": str(badge_file.relative_to(ROOT)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roster", type=Path, help="Named CSV or TSV roster with student emails")
    args = parser.parse_args()
    try:
        matches, issues, total = read_roster(args.roster)
    except ValueError as error:
        parser.error(str(error))
    drafts = [make_draft(item) for item in matches]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"roster": str(args.roster), "total_rows": total, "drafts": drafts, "issues": issues}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Prepared {len(drafts)} draft plans from {total} rows; {len(issues)} need review. Saved {OUTPUT}")
    if issues:
        for issue in issues[:10]:
            print(f"  Row {issue['row']}: {issue['name']} — {issue['reason']}")


if __name__ == "__main__":
    main()
