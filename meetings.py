import secrets
from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from models import db, Meeting

meetings_bp = Blueprint("meetings", __name__)


def generate_meeting_code():
    # short, human-shareable, random code e.g. "A1B2C3"
    while True:
        code = secrets.token_hex(3).upper()
        if not Meeting.query.filter_by(code=code).first():
            return code


@meetings_bp.route("/meetings", methods=["GET"])
@login_required
def meetings_home():
    my_meetings = Meeting.query.filter(
        (Meeting.organizer_id == current_user.id) | (Meeting.participant_id == current_user.id)
    ).order_by(Meeting.created_at.desc()).all()
    return render_template("meetings.html", meetings=my_meetings)


@meetings_bp.route("/meetings/create", methods=["POST"])
@login_required
def create_meeting():
    code = generate_meeting_code()
    meeting = Meeting(code=code, organizer_id=current_user.id, status="scheduled")
    db.session.add(meeting)
    db.session.commit()
    flash(f"Meeting created! Share this code: {code}", "success")
    return redirect(url_for("meetings.meetings_home"))


@meetings_bp.route("/meetings/join", methods=["POST"])
@login_required
def join_meeting():
    code = request.form.get("code", "").strip().upper()
    meeting = Meeting.query.filter_by(code=code).first()

    if meeting is None:
        flash("No meeting found with that code.", "error")
        return redirect(url_for("meetings.meetings_home"))

    # Organizer joining their own meeting, or a participant joining
    if meeting.organizer_id != current_user.id:
        if meeting.participant_id is None:
            meeting.participant_id = current_user.id
        elif meeting.participant_id != current_user.id:
            flash("This meeting already has a participant.", "error")
            return redirect(url_for("meetings.meetings_home"))

    meeting.status = "active"
    db.session.commit()
    return redirect(url_for("main.call_room", room=meeting.code))
