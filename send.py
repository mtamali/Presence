import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

def send_email_without_attachment(recipient, subject, body):
    """Sends an email without any attachments using credentials from .env file."""
    # Get email credentials from environment variables
    mail_username = os.getenv('MAIL_USERNAME')
    mail_password = os.getenv('MAIL_PASSWORD')
    mail_server = os.getenv('MAIL_SERVER')
    mail_port = int(os.getenv('MAIL_PORT', 587))

    msg = MIMEMultipart()
    msg['From'] = mail_username
    msg['To'] = recipient
    msg['Subject'] = subject

    # Attach the body as HTML if it contains HTML tags, otherwise as plain text
    if '<html>' in body or '<body>' in body or '<div>' in body or '<p>' in body:
        msg.attach(MIMEText(body, 'html'))
    else:
        msg.attach(MIMEText(body))

    try:
        server = smtplib.SMTP(mail_server, mail_port)
        server.starttls()
        server.login(mail_username, mail_password)
        server.send_message(msg)
        server.quit()
        print(f"Email sent successfully to {recipient}")
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False
    finally:
        if 'server' in locals() and server is not None:
            try:
                server.quit()
            except:
                pass

def generate_badge_pdf(name, index, template_path, output_path, signature_path):
    template = Image.open(template_path)

    # Add name to the badge
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
    font = ImageFont.truetype(font_path, size=22)
    draw = ImageDraw.Draw(template)
    bbox = draw.textbbox((0, 0), name, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    text_position = ((template.width - text_width) // 2, 180)
    draw.text(text_position, name, fill="black", font=font)

    # Generate QR code
    qr_data = f"{name}, GIS4D14-19-2024, {index}"
    qr = qrcode.QRCode(box_size=10, border=1)
    qr.add_data(qr_data)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="#251e0a", back_color="#f0e3cb")
    qr_img = qr_img.resize((150, 150))
    qr_x = (template.width - qr_img.width) // 2
    qr_y = 280
    template.paste(qr_img, (qr_x, qr_y))

    # Add signature
    signature = Image.open(signature_path).convert("RGBA")
    signature_width = 40
    signature_height = int((signature.height / signature.width) * signature_width)
    signature = signature.resize((signature_width, signature_height))
    signature_position = (template.width - signature_width - 20, template.height - signature_height - 20)
    template.paste(signature, signature_position, mask=signature)

    # Resize badge and save as PDF
    badge_resized = template.resize((300, 475))
    temp_png = os.path.join(output_path, f"{name}_resized.png")
    badge_resized.save(temp_png)
    pdf_path = os.path.join(output_path, f"{name}.pdf")
    pdf = FPDF(unit="pt", format=(300, 475))
    pdf.add_page()
    pdf.image(temp_png, x=0, y=0, w=300, h=475)
    pdf.output(pdf_path)
    os.remove(temp_png)

    return pdf_path
