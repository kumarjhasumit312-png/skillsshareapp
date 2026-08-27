from flask_socketio import join_room, leave_room, emit
from flask_login import current_user


def register_socket_events(socketio):

    @socketio.on("connect")
    def handle_connect():
        # Every logged-in user gets their own personal room (user_<id>),
        # so we can push notifications straight to them from anywhere
        # in the app (e.g. when someone sends them a request).
        if current_user.is_authenticated:
            join_room(f"user_{current_user.id}")
            emit("status_update", {"user_id": current_user.id, "status": "online"},
                 broadcast=True, include_self=False)

    @socketio.on("disconnect")
    def handle_disconnect():
        if current_user.is_authenticated:
            emit("status_update", {"user_id": current_user.id, "status": "offline"},
                 broadcast=True, include_self=False)

    @socketio.on("join")
    def handle_join(data):
        room = data.get("room")
        join_room(room)
        # tell the other person in the room someone joined
        emit("user_joined", {"name": current_user.name if current_user.is_authenticated else "Guest"},
             room=room, include_self=False)

    @socketio.on("signal")
    def handle_signal(data):
        # relay WebRTC offer/answer/ICE candidates to the other peer in the room
        room = data.get("room")
        emit("signal", data, room=room, include_self=False)

    @socketio.on("leave")
    def handle_leave(data):
        room = data.get("room")
        leave_room(room)
        emit("user_left", {}, room=room, include_self=False)

    @socketio.on("status_update")
    def handle_status_update(data):
        # broadcast a user's online/offline/in-call status
        emit("status_update", data, broadcast=True, include_self=False)


def notify_user(socketio, user_id, payload):
    """Push a live notification to one specific user's personal room.
    Call this from routes.py (e.g. after a match request is sent/accepted)."""
    socketio.emit("notification", payload, room=f"user_{user_id}")
