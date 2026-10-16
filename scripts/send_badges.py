"""Send badge emails to students via SMTP.

Reads the draft plan produced by prepare_badge_drafts.py and sends each
matched student their personalised QR badge as an email attachment.

Prerequisites
-------------
1. Generate badges:           python scripts/generate_badges.py
2. Export a named roster from Google Classroom (People → Download CSV).
3. Create the draft plan:     python scripts/prepare_badge_drafts.py path/to/roster.csv
4. Review generated/draft-plan.json — verify every student–email pair.
5. Create a .env file in the project root with:
       MAIL_USERNAME=you@gmail.com
       MAIL_PASSWORD=xxxx xxxx xxxx xxxx
       MAIL_SERVER=smtp.gmail.com
       MAIL_PORT=587

   For Gmail, create an App Password at https://myaccount.google.com/apppasswords
   (requires 2-Step Verification on your Google account).

6. Install python-dotenv:     pip install python-dotenv

Usage
-----
    python scripts/send_badges.py                  # send all drafts
    python scripts/send_badges.py --dry-run        # preview without sending
    python scripts/send_badges.py --delay 3        # 3 s between emails
    python scripts/send_badges.py --plan other.json # custom plan file
"""

import argparse
import json
import os
import smtplib
import sys
import time
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PLAN = ROOT / "generated" / "draft-plan.json"

# Load .env from project root
load_dotenv(ROOT / ".env")


def send_email(smtp_connection, sender: str, draft: dict) -> None:
    """Build and send an email with the badge PNG attached."""
    msg = MIMEMultipart()
    msg["From"] = sender
    msg["To"] = draft["to"]
    msg["Subject"] = draft["subject"]
    msg.attach(MIMEText(draft["html_body"], "html", "utf-8"))

    badge_path = ROOT / draft["attachment"]
    if not badge_path.is_file():
        raise FileNotFoundError(
            f"Badge image missing: {badge_path}\n"
            "Run  python scripts/generate_badges.py  first."
        )
    with badge_path.open("rb") as fh:
        part = MIMEBase("image", "png")
        part.set_payload(fh.read())
        encoders.encode_base64(part)
        part.add_header(
            "Content-Disposition",
            f'attachment; filename="{badge_path.name}"',
        )
        msg.attach(part)

    smtp_connection.send_message(msg)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be sent without connecting to the mail server",
    )
    parser.add_argument(
        "--plan",
        type=Path,
        default=DEFAULT_PLAN,
        help="Path to the draft-plan.json file (default: generated/draft-plan.json)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=2.0,
        help="Seconds to wait between emails to avoid rate limits (default: 2)",
    )
    args = parser.parse_args()

    # ── Load draft plan ──────────────────────────────────────────────────
    if not args.plan.is_file():
        print(f"Draft plan not found: {args.plan}")
        print("Run  python scripts/prepare_badge_drafts.py <roster.csv>  first.")
        raise SystemExit(1)

    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    drafts = plan["drafts"]
    issues = plan.get("issues", [])

    print(f"Draft plan loaded: {len(drafts)} emails to send, {len(issues)} skipped")
    if issues:
        print()
        for issue in issues[:10]:
            print(f"  ⚠  Row {issue.get('row', '?')}: {issue['name']} — {issue['reason']}")
        if len(issues) > 10:
            print(f"  … and {len(issues) - 10} more")

    if not drafts:
        print("\nNo matched students to email.")
        raise SystemExit(0)

    # ── Dry run ──────────────────────────────────────────────────────────
    if args.dry_run:
        print()
        for draft in drafts:
            badge_ok = (ROOT / draft["attachment"]).is_file()
            badge_mark = "✓" if badge_ok else "✗ MISSING"
            print(
                f"  → {draft['student']:40s}  {draft['speciality']}  "
                f"<{draft['to']}>  badge: {badge_mark}"
            )
        print(f"\nDry run complete. {len(drafts)} emails would be sent.")
        return

    # ── Credentials from .env ────────────────────────────────────────────
    mail_username = os.getenv("MAIL_USERNAME", "").strip()
    mail_password = os.getenv("MAIL_PASSWORD", "").strip()
    mail_server = os.getenv("MAIL_SERVER", "smtp.gmail.com").strip()
    mail_port = int(os.getenv("MAIL_PORT", "587"))

    if not mail_username or not mail_password:
        print(
            "\nMissing credentials. Create a .env file in the project root:\n"
            "  MAIL_USERNAME=you@gmail.com\n"
            "  MAIL_PASSWORD=xxxx xxxx xxxx xxxx\n"
            "  MAIL_SERVER=smtp.gmail.com\n"
            "  MAIL_PORT=587\n\n"
            "For Gmail, create an App Password at\n"
            "  https://myaccount.google.com/apppasswords"
        )
        raise SystemExit(1)

    # ── Send ─────────────────────────────────────────────────────────────
    print(f"\nConnecting to {mail_server}:{mail_port} as {mail_username} …")
    sent = 0
    failed = 0
    try:
        server = smtplib.SMTP(mail_server, mail_port)
        server.starttls()
        server.login(mail_username, mail_password)

        for i, draft in enumerate(drafts):
            try:
                send_email(server, mail_username, draft)
                sent += 1
                print(f"  ✓ [{sent}/{len(drafts)}] {draft['student']} <{draft['to']}>")
            except Exception as exc:
                failed += 1
                print(f"  ✗ {draft['student']} <{draft['to']}>: {exc}", file=sys.stderr)
            if i < len(drafts) - 1:
                time.sleep(args.delay)

        server.quit()
    except Exception as exc:
        print(f"\nSMTP connection error: {exc}", file=sys.stderr)
        raise SystemExit(1)

    print(f"\nDone. Sent {sent}, failed {failed}, total {len(drafts)}.")


if __name__ == "__main__":
    main()
