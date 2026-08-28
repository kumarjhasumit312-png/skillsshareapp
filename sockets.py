from flask_socketio import join_room, leave_room, emit
from flask_login import current_user


def register_socket_events(socketio):

    # ==========================================================
    # SOCKET CONNECT
    # ==========================================================

    @socketio.on("connect")
    def handle_connect():

        print(
            f"[Socket] Connected: "
            f"user={current_user.id if current_user.is_authenticated else 'guest'}"
        )

        if current_user.is_authenticated:

            join_room(
                f"user_{current_user.id}"
            )

            emit(
                "status_update",
                {
                    "user_id": current_user.id,
                    "status": "online"
                },
                broadcast=True,
                include_self=False
            )


    # ==========================================================
    # SOCKET DISCONNECT
    # ==========================================================

    @socketio.on("disconnect")
    def handle_disconnect():

        print(
            f"[Socket] Disconnected: "
            f"user={current_user.id if current_user.is_authenticated else 'guest'}"
        )

        if current_user.is_authenticated:

            emit(
                "status_update",
                {
                    "user_id": current_user.id,
                    "status": "offline"
                },
                broadcast=True,
                include_self=False
            )


    # ==========================================================
    # JOIN VIDEO MEETING
    # ==========================================================

    @socketio.on("join")
    def handle_join(data):

        room = data.get("room")

        if not room:
            print("[WebRTC] Join rejected: no room")
            return

        print(
            f"[WebRTC] User "
            f"{current_user.id if current_user.is_authenticated else 'guest'} "
            f"joining room: {room}"
        )

        join_room(room)

        # Tell ONLY the other user.
        # The existing user will create the OFFER.
        emit(
            "user_joined",
            {
                "name": (
                    current_user.name
                    if current_user.is_authenticated
                    else "Guest"
                )
            },
            room=room,
            include_self=False
        )

        print(
            f"[WebRTC] Join notification sent for room: {room}"
        )


    # ==========================================================
    # WEBRTC SIGNALING
    # OFFER / ANSWER / ICE
    # ==========================================================

    @socketio.on("signal")
    def handle_signal(data):

        room = data.get("room")
        signal_type = data.get("type")

        if not room:
            print(
                "[WebRTC] Signal rejected: no room"
            )
            return

        if not signal_type:
            print(
                "[WebRTC] Signal rejected: no type"
            )
            return

        print(
            f"[WebRTC] Relaying signal: "
            f"type={signal_type}, room={room}"
        )

        # Send signal ONLY to the other participant.
        emit(
            "signal",
            data,
            room=room,
            include_self=False
        )


    # ==========================================================
    # LEAVE MEETING
    # ==========================================================

    @socketio.on("leave")
    def handle_leave(data):

        room = data.get("room")

        if not room:
            return

        print(
            f"[WebRTC] User leaving room: {room}"
        )

        leave_room(room)

        emit(
            "user_left",
            {},
            room=room,
            include_self=False
        )


    # ==========================================================
    # STATUS UPDATE
    # ==========================================================

    @socketio.on("status_update")
    def handle_status_update(data):

        emit(
            "status_update",
            data,
            broadcast=True,
            include_self=False
        )


# ==============================================================
# NOTIFICATION HELPER
# ==============================================================

def notify_user(socketio, user_id, payload):

    socketio.emit(
        "notification",
        payload,
        room=f"user_{user_id}"
    )
