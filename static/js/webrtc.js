// SkillShare 1-to-1 WebRTC video calling
// Socket.IO = signaling
// STUN + TURN = NAT traversal

const socket = io({
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000
});

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const config = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        },

        // Metered TURN
        {
            urls: "turn:relay.metered.ca:80",
            username: "YOUR_USERNAME",
            credential: "YOUR_CREDENTIAL"
        },
        {
            urls: "turn:relay.metered.ca:443",
            username: "YOUR_USERNAME",
            credential: "YOUR_CREDENTIAL"
        },
        {
            urls: "turn:relay.metered.ca:443?transport=tcp",
            username: "YOUR_USERNAME",
            credential: "YOUR_CREDENTIAL"
        }
    ]
};

let localStream = null;
let screenStream = null;
let peerConnection = null;

let isMuted = false;
let isVideoOff = false;

let remoteDescriptionSet = false;
let pendingIceCandidates = [];


// ==========================================================
// SOCKET CONNECTION
// ==========================================================

socket.on("connect", () => {
    console.log("=================================");
    console.log("Socket.IO CONNECTED");
    console.log("Socket ID:", socket.id);
    console.log("Room:", ROOM);
    console.log("=================================");

    // Important:
    // Only join after Socket.IO has actually connected.
    socket.emit("join", {
        room: ROOM
    });
});


socket.on("disconnect", reason => {
    console.warn("Socket.IO disconnected:", reason);
});


socket.on("connect_error", error => {
    console.error("Socket.IO connection ERROR:", error);
});


// ==========================================================
// CREATE PEER CONNECTION
// ==========================================================

function createPeerConnection() {

    console.log("Creating RTCPeerConnection...");

    peerConnection = new RTCPeerConnection(config);

    // ------------------------------------------------------
    // LOCAL ICE CANDIDATES
    // ------------------------------------------------------

    peerConnection.onicecandidate = event => {

        if (!event.candidate) {
            return;
        }

        console.log(
            "Sending ICE candidate:",
            event.candidate.candidate
        );

        socket.emit("signal", {
            room: ROOM,
            type: "ice-candidate",
            candidate: event.candidate
        });
    };


    // ------------------------------------------------------
    // REMOTE TRACK
    // ------------------------------------------------------

    peerConnection.ontrack = event => {

        console.log("=================================");
        console.log("REMOTE TRACK RECEIVED");
        console.log("=================================");

        if (event.streams && event.streams[0]) {

            remoteVideo.srcObject =
                event.streams[0];

            remoteVideo.play().catch(error => {
                console.warn(
                    "Remote video play warning:",
                    error
                );
            });
        }
    };


    // ------------------------------------------------------
    // ICE STATE
    // ------------------------------------------------------

    peerConnection.oniceconnectionstatechange = () => {

        console.log(
            "ICE state:",
            peerConnection.iceConnectionState
        );

        if (
            peerConnection.iceConnectionState ===
            "failed"
        ) {
            console.error(
                "ICE FAILED - TURN/STUN connection failed."
            );
        }

        if (
            peerConnection.iceConnectionState ===
            "connected"
        ) {
            console.log(
                "ICE CONNECTED!"
            );
        }

        if (
            peerConnection.iceConnectionState ===
            "completed"
        ) {
            console.log(
                "ICE COMPLETED!"
            );
        }
    };


    // ------------------------------------------------------
    // PEER CONNECTION STATE
    // ------------------------------------------------------

    peerConnection.onconnectionstatechange = () => {

        console.log(
            "WebRTC connection state:",
            peerConnection.connectionState
        );

        if (
            peerConnection.connectionState ===
            "connected"
        ) {
            console.log(
                "================================="
            );
            console.log(
                "WEBRTC VIDEO CALL CONNECTED!"
            );
            console.log(
                "================================="
            );
        }

        if (
            peerConnection.connectionState ===
            "failed"
        ) {
            console.error(
                "WEBRTC CONNECTION FAILED"
            );
        }
    };


    // ------------------------------------------------------
    // SIGNALLING STATE
    // ------------------------------------------------------

    peerConnection.onsignalingstatechange = () => {

        console.log(
            "Signaling state:",
            peerConnection.signalingState
        );
    };


    // ------------------------------------------------------
    // ADD LOCAL TRACKS
    // ------------------------------------------------------

    if (localStream) {

        localStream
            .getTracks()
            .forEach(track => {

                console.log(
                    "Adding local track:",
                    track.kind
                );

                peerConnection.addTrack(
                    track,
                    localStream
                );
            });
    }

    return peerConnection;
}


// ==========================================================
// INITIALIZE CAMERA + MICROPHONE
// ==========================================================

async function init() {

    try {

        console.log(
            "Initializing camera and microphone..."
        );

        localStream =
            await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

        localVideo.srcObject =
            localStream;

        console.log(
            "Camera + microphone ready."
        );

        // Create peer connection AFTER media is ready.
        createPeerConnection();

    } catch (error) {

        console.error(
            "getUserMedia ERROR:",
            error
        );

        alert(
            "Camera or microphone permission is required."
        );
    }
}


// ==========================================================
// OTHER USER JOINED
// ==========================================================

socket.on("user_joined", async data => {

    console.log(
        "================================="
    );

    console.log(
        "OTHER USER JOINED ROOM"
    );

    console.log(
        "User:",
        data
    );

    console.log(
        "================================="
    );


    try {

        if (!peerConnection) {
            createPeerConnection();
        }

        // The existing user creates the offer.
        console.log(
            "Creating WebRTC OFFER..."
        );

        const offer =
            await peerConnection.createOffer();

        await peerConnection.setLocalDescription(
            offer
        );

        console.log(
            "Sending OFFER..."
        );

        socket.emit("signal", {
            room: ROOM,
            type: "offer",
            offer: offer
        });

    } catch (error) {

        console.error(
            "OFFER creation failed:",
            error
        );
    }
});


// ==========================================================
// WEBRTC SIGNAL
// ==========================================================

socket.on("signal", async data => {

    console.log(
        "SIGNAL RECEIVED:",
        data.type
    );


    try {

        if (!peerConnection) {
            createPeerConnection();
        }


        // ==================================================
        // OFFER
        // ==================================================

        if (data.type === "offer") {

            console.log(
                "Receiving OFFER..."
            );

            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(
                    data.offer
                )
            );

            remoteDescriptionSet = true;

            // Add ICE candidates that arrived early.
            await flushPendingIceCandidates();


            console.log(
                "Remote OFFER set."
            );


            const answer =
                await peerConnection.createAnswer();


            await peerConnection.setLocalDescription(
                answer
            );


            console.log(
                "Sending ANSWER..."
            );


            socket.emit("signal", {
                room: ROOM,
                type: "answer",
                answer: answer
            });
        }


        // ==================================================
        // ANSWER
        // ==================================================

        else if (data.type === "answer") {

            console.log(
                "Receiving ANSWER..."
            );


            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(
                    data.answer
                )
            );


            remoteDescriptionSet = true;


            await flushPendingIceCandidates();


            console.log(
                "Remote ANSWER set."
            );
        }


        // ==================================================
        // ICE CANDIDATE
        // ==================================================

        else if (
            data.type ===
            "ice-candidate"
        ) {

            const candidate =
                new RTCIceCandidate(
                    data.candidate
                );


            // ICE candidate can arrive before
            // offer/answer is installed.
            if (
                !remoteDescriptionSet ||
                !peerConnection.remoteDescription
            ) {

                console.log(
                    "Queueing ICE candidate..."
                );

                pendingIceCandidates.push(
                    candidate
                );

            } else {

                console.log(
                    "Adding ICE candidate..."
                );

                await peerConnection
                    .addIceCandidate(
                        candidate
                    );
            }
        }

    } catch (error) {

        console.error(
            "SIGNAL HANDLING ERROR:",
            error
        );
    }
});


// ==========================================================
// FLUSH QUEUED ICE CANDIDATES
// ==========================================================

async function flushPendingIceCandidates() {

    if (!peerConnection) {
        return;
    }

    if (!peerConnection.remoteDescription) {
        return;
    }

    for (
        const candidate
        of pendingIceCandidates
    ) {

        try {

            await peerConnection
                .addIceCandidate(
                    candidate
                );

        } catch (error) {

            console.error(
                "Queued ICE candidate error:",
                error
            );
        }
    }

    pendingIceCandidates = [];
}


// ==========================================================
// USER LEFT
// ==========================================================

socket.on("user_left", () => {

    console.log(
        "Other user left the meeting."
    );

    if (remoteVideo) {
        remoteVideo.srcObject = null;
    }
});


// ==========================================================
// MUTE BUTTON
// ==========================================================

const muteBtn =
    document.getElementById(
        "muteBtn"
    );

if (muteBtn) {

    muteBtn.addEventListener(
        "click",
        () => {

            if (!localStream) {
                return;
            }

            isMuted = !isMuted;

            localStream
                .getAudioTracks()
                .forEach(track => {
                    track.enabled =
                        !isMuted;
                });

            muteBtn.textContent =
                isMuted
                    ? "Unmute"
                    : "Mute";
        }
    );
}


// ==========================================================
// VIDEO BUTTON
// ==========================================================

const videoBtn =
    document.getElementById(
        "videoBtn"
    );

if (videoBtn) {

    videoBtn.addEventListener(
        "click",
        () => {

            if (!localStream) {
                return;
            }

            isVideoOff =
                !isVideoOff;

            localStream
                .getVideoTracks()
                .forEach(track => {
                    track.enabled =
                        !isVideoOff;
                });

            videoBtn.textContent =
                isVideoOff
                    ? "Turn On Video"
                    : "Turn Off Video";
        }
    );
}


// ==========================================================
// SCREEN SHARE
// ==========================================================

const screenShareBtn =
    document.getElementById(
        "screenShareBtn"
    );

if (screenShareBtn) {

    screenShareBtn.addEventListener(
        "click",
        async () => {

            try {

                if (!peerConnection) {
                    return;
                }

                screenStream =
                    await navigator.mediaDevices
                        .getDisplayMedia({
                            video: true
                        });

                const screenTrack =
                    screenStream
                        .getVideoTracks()[0];


                const sender =
                    peerConnection
                        .getSenders()
                        .find(
                            s =>
                                s.track &&
                                s.track.kind ===
                                "video"
                        );


                if (sender) {

                    await sender.replaceTrack(
                        screenTrack
                    );
                }


                localVideo.srcObject =
                    screenStream;


                screenTrack.onended =
                    async () => {

                        const cameraTrack =
                            localStream
                                .getVideoTracks()[0];


                        if (
                            sender &&
                            cameraTrack
                        ) {

                            await sender.replaceTrack(
                                cameraTrack
                            );
                        }


                        localVideo.srcObject =
                            localStream;


                        screenStream = null;
                    };

            } catch (error) {

                console.error(
                    "Screen share error:",
                    error
                );
            }
        }
    );
}


// ==========================================================
// END CALL
// ==========================================================

const endCallBtn =
    document.getElementById(
        "endCallBtn"
    );

if (endCallBtn) {

    endCallBtn.addEventListener(
        "click",
        () => {

            socket.emit(
                "leave",
                {
                    room: ROOM
                }
            );


            if (localStream) {

                localStream
                    .getTracks()
                    .forEach(track => {
                        track.stop();
                    });
            }


            if (screenStream) {

                screenStream
                    .getTracks()
                    .forEach(track => {
                        track.stop();
                    });
            }


            if (peerConnection) {

                peerConnection.close();

                peerConnection = null;
            }


            localVideo.srcObject =
                null;

            remoteVideo.srcObject =
                null;


            window.location.href =
                "/dashboard";
        }
    );
}


// ==========================================================
// START
// ==========================================================

init();
