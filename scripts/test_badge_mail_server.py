import sys
import unittest
import io
from email import message_from_bytes
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from badge_mail_server import clean_students
from generate_badges import make_badge
from send_badges import send_badge_bytes


STUDENT = {
    "id": "student-1", "matricule": "38000001", "lastName": "Example",
    "firstName": "Student", "email": "student@example.com", "speciality": "1MAUT",
    "badgeCode": "ATD26-1234567890ABCDEF",
}


class FakeSmtp:
    def send_message(self, message):
        self.message = message


class BadgeMailTests(unittest.TestCase):
    def test_validates_recipient_and_rejects_duplicate_student(self):
        self.assertEqual(clean_students([STUDENT])[0]["email"], "student@example.com")
        with self.assertRaises(ValueError):
            clean_students([{**STUDENT, "email": "not-an-email"}])
        with self.assertRaises(ValueError):
            clean_students([{**STUDENT, "email": "a@example.com,b@example.com"}])
        with self.assertRaises(ValueError):
            clean_students([STUDENT, STUDENT])

    def test_attaches_personal_badge_to_correct_address(self):
        smtp = FakeSmtp()
        image = make_badge(STUDENT)
        output = io.BytesIO()
        image.save(output, format="PNG")
        send_badge_bytes(smtp, "teacher@example.com", STUDENT["email"],
                         "Student Example", output.getvalue(), "badge.png", "1MAUT")
        message = message_from_bytes(smtp.message.as_bytes())
        self.assertEqual(message["To"], STUDENT["email"])
        attachment = next(part for part in message.walk() if part.get_content_maintype() == "image")
        self.assertEqual(attachment.get_filename(), "badge.png")
        self.assertTrue(attachment.get_payload(decode=True).startswith(b"\x89PNG\r\n"))


if __name__ == "__main__":
    unittest.main()
