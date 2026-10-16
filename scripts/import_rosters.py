"""Convert the three official spreadsheets to the app's student roster.

Existing badge codes are kept when this script is run again. New students
receive a random code that contains no name or university identifier.
"""

import json
import secrets
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src" / "data" / "students.json"
SPECIALITIES = ("1MAUT", "1MESE", "4IGEI")


def main() -> None:
    previous = {}
    if OUTPUT.exists():
        previous = {(row["speciality"], row["registration"]): row for row in json.loads(OUTPUT.read_text())}

    students = []
    used_codes = {row["badgeCode"] for row in previous.values()}
    for speciality in SPECIALITIES:
        sheet = load_workbook(ROOT / "Listes 2627" / f"{speciality}.xlsx", read_only=True, data_only=True).active
        for row in list(sheet.values)[6:]:
            if not isinstance(row[0], (int, float)) or not row[1]:
                continue
            registration = str(row[1]).strip()
            old = previous.get((speciality, registration))
            code = old["badgeCode"] if old else None
            if not code:
                while True:
                    code = "ATD26-" + secrets.token_hex(8).upper()
                    if code not in used_codes:
                        break
            used_codes.add(code)
            student = {
                "id": registration,
                "registration": registration,
                "matricule": str(row[3]).strip(),
                "lastName": str(row[4]).strip(),
                "firstName": str(row[5]).strip(),
                "speciality": speciality,
                "section": str(row[6] or "").strip(),
                "group": str(row[7] or "").strip(),
                "badgeCode": code,
            }
            if old and old.get("email"):
                student["email"] = old["email"]
            students.append(student)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(students, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(students)} students to {OUTPUT}")


if __name__ == "__main__":
    main()
