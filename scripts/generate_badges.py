"""Render each student's assigned QR badge as an email-ready PNG attachment."""

import csv
import json
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "generated" / "badges"
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
NAVY = "#112C3B"
TEAL = "#087F83"
INK = "#142B39"
MUTED = "#718A95"


def fit_font(text: str, max_width: int, start: int = 54) -> ImageFont.FreeTypeFont:
    size = start
    while size > 27:
        font = ImageFont.truetype(FONT_BOLD, size)
        if font.getlength(text) <= max_width:
            return font
        size -= 2
    return ImageFont.truetype(FONT_BOLD, size)


def make_badge(student: dict) -> Image.Image:
    image = Image.new("RGB", (1200, 700), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1200, 126), fill=NAVY)
    draw.rounded_rectangle((44, 35, 105, 96), radius=15, fill="#E3F5F2")
    draw.text((59, 42), "P", font=ImageFont.truetype(FONT_BOLD, 39), fill=TEAL)
    draw.text((128, 45), "Présence", font=ImageFont.truetype(FONT_BOLD, 39), fill="white")
    draw.rounded_rectangle((963, 43, 1157, 88), radius=10, fill="#285466")
    draw.text((1060, 50), student["speciality"], font=ImageFont.truetype(FONT_BOLD, 25), fill="white", anchor="mt")

    draw.text((63, 193), "STUDENT BADGE", font=ImageFont.truetype(FONT_BOLD, 25), fill=TEAL)
    draw.text((61, 266), student["lastName"], font=fit_font(student["lastName"], 650), fill=INK)
    first = student["firstName"]
    draw.text((61, 353), first, font=fit_font(first, 650, 47), fill=INK)
    draw.text((63, 486), f"Matricule  {student['matricule']}", font=ImageFont.truetype(FONT_REGULAR, 26), fill=MUTED)

    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=4)
    qr.add_data(student["badgeCode"])
    qr.make(fit=True)
    qr_image = qr.make_image(fill_color=INK, back_color="white").convert("RGB")
    qr_image.thumbnail((370, 370), Image.Resampling.NEAREST)
    qr_x = 776 + (370 - qr_image.width) // 2
    qr_y = 181 + (370 - qr_image.height) // 2
    image.paste(qr_image, (qr_x, qr_y))

    draw.line((0, 605, 1200, 605), fill="#DFEAED", width=2)
    draw.text((63, 634), "Academic year 2026/27", font=ImageFont.truetype(FONT_REGULAR, 22), fill=MUTED)
    draw.text((1138, 634), student["badgeCode"], font=ImageFont.truetype(FONT_BOLD, 20), fill="#52747E", anchor="ra")
    return image


def main() -> None:
    students = json.loads((ROOT / "src" / "data" / "students.json").read_text(encoding="utf-8"))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for student in students:
        path = OUTPUT / student["speciality"] / f"{student['matricule']}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        make_badge(student).save(path, optimize=True)
        manifest.append({
            "speciality": student["speciality"],
            "last_name": student["lastName"],
            "first_name": student["firstName"],
            "matricule": student["matricule"],
            "email": student.get("email", ""),
            "badge_file": str(path.relative_to(ROOT)),
        })
    with (OUTPUT.parent / "badge-manifest.csv").open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=manifest[0].keys())
        writer.writeheader()
        writer.writerows(manifest)
    print(f"Generated {len(manifest)} badges in {OUTPUT}")


if __name__ == "__main__":
    main()
