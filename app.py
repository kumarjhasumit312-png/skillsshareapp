from flask import Flask
from flask_login import LoginManager
from flask_mail import Mail
from flask_socketio import SocketIO

from config import Config
from models import db, User

mail = Mail()
socketio = SocketIO()
login_manager = LoginManager()


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    mail.init_app(app)
    # async_mode="threading" avoids needing eventlet/gevent - works out of
    # the box on any Python version, including newer ones where eventlet
    # sometimes breaks. Fine for development and small-scale production.
    socketio.init_app(app, cors_allowed_origins="*", async_mode="threading")

    login_manager.init_app(app)
    login_manager.login_view = "auth.login"

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    from auth import auth_bp
    from main import main_bp
    from meetings import meetings_bp
    from feedback import feedback_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    app.register_blueprint(meetings_bp)
    app.register_blueprint(feedback_bp)

    from sockets import register_socket_events
    register_socket_events(socketio)

    with app.app_context():
        db.create_all()

    return app


app = create_app()

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
