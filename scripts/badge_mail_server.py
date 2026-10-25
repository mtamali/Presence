"""Local mail bridge for Students Management.

Run alongside Vite: python scripts/badge_mail_server.py
The server listens on 127.0.0.1 only. SMTP credentials stay in the ignored
project-root .env file and are never sent to the browser or Android app.
"""

import argparse
import io
import json
import os
import re
import smtplib
import ssl
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from generate_badges import make_badge
from send_badges import send_badge_bytes


ALLOWED_ORIGINS = {"http://127.0.0.1:5175", "http://localhost:5175",
                   "http://127.0.0.1:5173", "http://localhost:5173"}
SPECIALITIES = {"1MAUT", "1MESE", "4IGEI"}
EMAIL = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
MAX_BODY = 64 * 1024


def clean_students(value):
    if not isinstance(value, list) or not 1 <= len(value) <= 60:
        raise ValueError("Choose between 1 and 60 students.")
    students = []
    seen = set()
    for entry in value:
        if not isinstance(entry, dict):
            raise ValueError("Invalid student record.")
        student = {}
        for key in ("id", "matricule", "lastName", "firstName", "email", "speciality", "badgeCode"):
            field = entry.get(key, "")
            if not isinstance(field, str) or len(field) > 120 or "\r" in field or "\n" in field:
                raise ValueError(f"Invalid {key}.")
            student[key] = field.strip()
        if not student["id"] or not student["lastName"] or not student["badgeCode"]:
            raise ValueError("Student ID, name and badge code are required.")
        if student["speciality"] not in SPECIALITIES or not EMAIL.fullmatch(student["email"]):
            raise ValueError("A student has an invalid speciality or email address.")
        if student["id"] in seen:
            raise ValueError("The selection contains the same student twice.")
        seen.add(student["id"])
        student["matricule"] = student["matricule"] or student["id"]
        students.append(student)
    return students


def smtp_settings():
    username = os.getenv("MAIL_USERNAME", "").strip()
    password = os.getenv("MAIL_PASSWORD", "").strip()
    server = os.getenv("MAIL_SERVER", "smtp.gmail.com").strip()
    port = int(os.getenv("MAIL_PORT", "587"))
    if not username or not password:
        raise RuntimeError("Mail credentials are missing. Add MAIL_USERNAME and MAIL_PASSWORD to .env.")
    return username, password, server, port


class Handler(BaseHTTPRequestHandler):
    def respond(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def valid_origin(self):
        return self.headers.get("Origin") in ALLOWED_ORIGINS

    def do_GET(self):
        # Same-origin browser GETs normally omit Origin; the status contains
        # only a readiness flag, so requiring it here would hide a ready server.
        if self.path != "/api/badges/status" or (self.headers.get("Origin") and not self.valid_origin()):
            return self.respond(404, {"error": "Not found."})
        try:
            smtp_settings()
        except (RuntimeError, ValueError):
            return self.respond(200, {"ready": False, "reason": "Mail credentials are not configured on this computer."})
        return self.respond(200, {"ready": True})

    def do_POST(self):
        if self.path != "/api/badges/send" or not self.valid_origin():
            return self.respond(404, {"error": "Not found."})
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            return self.respond(415, {"error": "JSON is required."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY:
                raise ValueError("The selection is too large.")
            students = clean_students(json.loads(self.rfile.read(length)))
        except (ValueError, json.JSONDecodeError) as exc:
            return self.respond(400, {"error": str(exc)})
        try:
            username, password, host, port = smtp_settings()
        except (RuntimeError, ValueError) as exc:
            return self.respond(503, {"error": str(exc)})

        results = []
        try:
            with smtplib.SMTP(host, port, timeout=20) as smtp:
                smtp.starttls(context=ssl.create_default_context())
                smtp.login(username, password)
                for index, student in enumerate(students):
                    try:
                        image = make_badge(student)
                        output = io.BytesIO()
                        image.save(output, format="PNG", optimize=True)
                        safe_number = re.sub(r"[^A-Za-z0-9._-]", "_", student["matricule"])
                        filename = f"{student['speciality']}-{safe_number}-badge.png"
                        send_badge_bytes(smtp, username, student["email"],
                                         f"{student['firstName']} {student['lastName']}".strip(),
                                         output.getvalue(), filename, student["speciality"])
                        results.append({"id": student["id"], "sent": True})
                    except Exception:
                        results.append({"id": student["id"], "sent": False,
                                        "error": "Badge generation or mail delivery failed."})
                    if index < len(students) - 1:
                        time.sleep(1)
        except Exception:
            return self.respond(502, {"error": "Could not connect to the configured mail server."})
        print(f"Badge mail request: {sum(item['sent'] for item in results)} sent, "
              f"{sum(not item['sent'] for item in results)} failed")
        self.respond(200, {"results": results})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    print(f"Badge mail bridge listening on http://127.0.0.1:{args.port}")
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
