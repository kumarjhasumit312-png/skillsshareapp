from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from models import db, User, Skill, MatchRequest, Meeting

main_bp = Blueprint("main", __name__)


@main_bp.route("/")
def index():
    return redirect(url_for("main.dashboard"))


@main_bp.route("/dashboard")
@login_required
def dashboard():
    pending_requests = MatchRequest.query.filter_by(
        receiver_id=current_user.id, status="pending"
    ).all()

    upcoming_meetings = Meeting.query.filter(
        ((Meeting.organizer_id == current_user.id) | (Meeting.participant_id == current_user.id)),
        Meeting.status.in_(["scheduled", "active"])
    ).order_by(Meeting.created_at.desc()).limit(5).all()

    return render_template("dashboard.html", pending_requests=pending_requests,
                            upcoming_meetings=upcoming_meetings)


@main_bp.route("/skills", methods=["GET", "POST"])
@login_required
def skills():
    if request.method == "POST":
        teach_raw = request.form.get("teach_skills", "")
        learn_raw = request.form.get("learn_skills", "")

        def parse_skills(raw):
            names = [s.strip() for s in raw.split(",") if s.strip()]
            result = []
            for name in names:
                skill = Skill.query.filter(Skill.name.ilike(name)).first()
                if skill is None:
                    skill = Skill(name=name)
                    db.session.add(skill)
                result.append(skill)
            return result

        current_user.teach_skills = parse_skills(teach_raw)
        current_user.learn_skills = parse_skills(learn_raw)
        db.session.commit()
        flash("Your skills have been updated.", "success")
        return redirect(url_for("main.skills"))

    return render_template("skills.html")


@main_bp.route("/matches")
@login_required
def matches():
    # Find users whose "teach" skills overlap with what I want to learn,
    # and whose "learn" skills overlap with what I can teach.
    my_learn_ids = {s.id for s in current_user.learn_skills}
    my_teach_ids = {s.id for s in current_user.teach_skills}

    candidates = User.query.filter(User.id != current_user.id).all()
    suggestions = []
    for u in candidates:
        their_teach_ids = {s.id for s in u.teach_skills}
        their_learn_ids = {s.id for s in u.learn_skills}
        overlap_teach = my_learn_ids & their_teach_ids
        overlap_learn = my_teach_ids & their_learn_ids
        if overlap_teach or overlap_learn:
            suggestions.append({
                "user": u,
                "they_can_teach_you": [s for s in u.teach_skills if s.id in overlap_teach],
                "they_want_to_learn": [s for s in u.learn_skills if s.id in overlap_learn],
            })

    # Track existing request status with each suggested user
    existing = MatchRequest.query.filter(
        ((MatchRequest.sender_id == current_user.id) | (MatchRequest.receiver_id == current_user.id))
    ).all()
    status_map = {}
    for r in existing:
        other_id = r.receiver_id if r.sender_id == current_user.id else r.sender_id
        status_map[other_id] = r.status

    return render_template("matches.html", suggestions=suggestions, status_map=status_map)


@main_bp.route("/request/send/<int:user_id>", methods=["POST"])
@login_required
def send_request(user_id):
    if user_id == current_user.id:
        flash("You can't send a request to yourself.", "error")
        return redirect(url_for("main.matches"))

    existing = MatchRequest.query.filter(
        ((MatchRequest.sender_id == current_user.id) & (MatchRequest.receiver_id == user_id)) |
        ((MatchRequest.sender_id == user_id) & (MatchRequest.receiver_id == current_user.id))
    ).first()

    if existing:
        flash("A request already exists with this user.", "error")
        return redirect(url_for("main.matches"))

    req = MatchRequest(sender_id=current_user.id, receiver_id=user_id, status="pending")
    db.session.add(req)
    db.session.commit()

    from app import socketio
    from sockets import notify_user
    notify_user(socketio, user_id, {
        "message": f"{current_user.name} sent you a skill swap request",
        "type": "request_received"
    })

    flash("Request sent!", "success")
    return redirect(url_for("main.matches"))


@main_bp.route("/request/accept/<int:req_id>", methods=["POST"])
@login_required
def accept_request(req_id):
    req = MatchRequest.query.get_or_404(req_id)
    if req.receiver_id != current_user.id:
        flash("Not authorized.", "error")
        return redirect(url_for("main.dashboard"))
    req.status = "accepted"
    db.session.commit()

    from app import socketio
    from sockets import notify_user
    notify_user(socketio, req.sender_id, {
        "message": f"{current_user.name} accepted your skill swap request",
        "type": "request_accepted"
    })

    flash(f"You accepted {req.sender.name}'s request.", "success")
    return redirect(url_for("main.dashboard"))


@main_bp.route("/request/decline/<int:req_id>", methods=["POST"])
@login_required
def decline_request(req_id):
    req = MatchRequest.query.get_or_404(req_id)
    if req.receiver_id != current_user.id:
        flash("Not authorized.", "error")
        return redirect(url_for("main.dashboard"))
    req.status = "declined"
    db.session.commit()
    flash(f"You declined {req.sender.name}'s request.", "success")
    return redirect(url_for("main.dashboard"))


@main_bp.route("/call/<room>")
@login_required
def call_room(room):
    return render_template("call.html", room=room)
