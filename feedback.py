from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from models import db, Feedback

feedback_bp = Blueprint("feedback", __name__)


@feedback_bp.route("/feedback", methods=["GET", "POST"])
@login_required
def feedback_home():
    if request.method == "POST":
        rating_raw = request.form.get("rating", "")
        message = request.form.get("message", "").strip()

        try:
            rating = int(rating_raw)
        except (TypeError, ValueError):
            rating = 0

        if rating < 1 or rating > 5:
            flash("Please choose a star rating between 1 and 5.", "error")
            return redirect(url_for("feedback.feedback_home"))

        entry = Feedback(user_id=current_user.id, rating=rating, message=message or None)
        db.session.add(entry)
        db.session.commit()
        flash("Thanks for the feedback!", "success")
        return redirect(url_for("feedback.feedback_home"))

    history = Feedback.query.filter_by(user_id=current_user.id).order_by(
        Feedback.created_at.desc()
    ).all()
    return render_template("feedback.html", history=history)
