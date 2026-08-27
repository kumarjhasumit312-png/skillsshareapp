import os
from dotenv import load_dotenv

load_dotenv(override=True)

basedir = os.path.abspath(os.path.dirname(__file__))


class Config:
    # Flask secret key - used for sessions, CSRF, and token signing
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-this-in-production")

    # Database: SQLite for local dev, swap to PostgreSQL url in prod via env var
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "sqlite:///" + os.path.join(basedir, "app.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Mail settings - fill these in .env for real email sending
    MAIL_SERVER = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", 587))
    MAIL_USE_TLS = True
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD")
    # Brevo's SMTP login is often different from the actual "From" address
    # you verified in Brevo, so this can be set separately. Falls back to
    # MAIL_USERNAME if not given.
    MAIL_DEFAULT_SENDER = os.environ.get("MAIL_DEFAULT_SENDER", os.environ.get("MAIL_USERNAME"))

    # If True, skips real email sending and prints links to console instead.
    # Useful for local dev before you've set up an email account.
    MAIL_SUPPRESS_SEND = os.environ.get("MAIL_SUPPRESS_SEND", "True") == "True"
