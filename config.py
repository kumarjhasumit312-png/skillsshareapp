import os
from dotenv import load_dotenv

load_dotenv(override=True)

basedir = os.path.abspath(os.path.dirname(__file__))


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-this-in-production")

    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "sqlite:///" + os.path.join(basedir, "app.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    MAIL_SERVER = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", 587))
    MAIL_USE_TLS = True
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD")
    MAIL_DEFAULT_SENDER = os.environ.get("MAIL_DEFAULT_SENDER", os.environ.get("MAIL_USERNAME"))

    MAIL_SUPPRESS_SEND = os.environ.get("MAIL_SUPPRESS_SEND", "True") == "True"

    # Brevo HTTP API key (recommended for production - cloud hosts like
    # Render block outbound SMTP, but this uses regular HTTPS requests).
    BREVO_API_KEY = os.environ.get("BREVO_API_KEY")
    MAIL_SENDER_NAME = os.environ.get("MAIL_SENDER_NAME", "Skill Share")