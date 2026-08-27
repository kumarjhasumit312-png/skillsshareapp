from itsdangerous import URLSafeTimedSerializer
from flask import current_app, url_for
from flask_mail import Message


def get_serializer():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"])


def generate_token(email, salt):
    return get_serializer().dumps(email, salt=salt)


def verify_token(token, salt, max_age=3600):
    try:
        email = get_serializer().loads(token, salt=salt, max_age=max_age)
    except Exception:
        return None
    return email


def send_email(mail, subject, recipient, body):
    """Sends an email, or if MAIL_SUPPRESS_SEND is True, prints it to console
    so you can test the flow locally without a real mail account."""
    if current_app.config.get("MAIL_SUPPRESS_SEND"):
        print("=" * 60)
        print(f"[DEV MODE] Email to: {recipient}")
        print(f"Subject: {subject}")
        print(body)
        print("=" * 60)
        return
    msg = Message(subject, recipients=[recipient], body=body)
    mail.send(msg)


def send_verification_email(mail, user):
    token = generate_token(user.email, salt="email-verify")
    link = url_for("auth.verify_email", token=token, _external=True)
    body = f"Hi {user.name},\n\nVerify your email by clicking this link:\n{link}\n\nThis link expires in 1 hour."
    send_email(mail, "Verify your Skill Swap account", user.email, body)


def send_reset_email(mail, user):
    token = generate_token(user.email, salt="password-reset")
    link = url_for("auth.reset_password", token=token, _external=True)
    body = f"Hi {user.name},\n\nReset your password by clicking this link:\n{link}\n\nThis link expires in 1 hour."
    send_email(mail, "Reset your Skill Swap password", user.email, body)
