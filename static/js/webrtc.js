// Basic 1-to-1 WebRTC video call with Socket.IO signaling.
// STUN + TURN server for reliable connections across different networks.

const socket = io();

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const config = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        },
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


// ============================================================
// INITIALIZE CAMERA + MICROPHONE + PEER CONNECTION
// ============================================================

async function init() {
    try {
        console.log("Starting WebRTC...");

        // Get camera and microphone
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        // Show local camera
        localVideo.srcObject = localStream;

        // Create peer connection BEFORE joining the room
        peerConnection = new RTCPeerConnection(config);

        // Add local tracks to peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // ====================================================
        // REMOTE VIDEO
        // ====================================================

        peerConnection.ontrack = event => {
            console.log("Remote track received");

            if (event.streams && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];

                remoteVideo.play().catch(err => {
                    console.warn(
                        "Remote video autoplay blocked:",
                        err
                    );
                });
            }
        };

        // ====================================================
        // ICE CANDIDATES
        // ====================================================

        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                console.log(
                    "Sending ICE candidate:",
                    event.candidate.candidate
                );

                socket.emit("signal", {
                    room: ROOM,
                    type: "ice-candidate",
                    candidate: event.candidate
                });
            }
        };

        // ====================================================
        // CONNECTION STATE DEBUGGING
        // ====================================================

        peerConnection.oniceconnectionstatechange = () => {
            console.log(
                "ICE connection state:",
                peerConnection.iceConnectionState
            );
        };

        peerConnection.onconnectionstatechange = () => {
            console.log(
                "Peer connection state:",
                peerConnection.connectionState
            );

            if (
                peerConnection.connectionState === "connected"
            ) {
                console.log("WebRTC connected successfully!");
            }

            if (
                peerConnection.connectionState === "failed"
            ) {
                console.error(
                    "WebRTC connection failed."
                );
            }

            if (
                peerConnection.connectionState === "disconnected"
            ) {
                console.warn(
                    "WebRTC connection disconnected."
                );
            }
        };

        // ====================================================
        // JOIN ROOM
        // ====================================================

        console.log("Joining room:", ROOM);

        socket.emit("join", {
            room: ROOM
        });

    } catch (error) {
        console.error(
            "Camera/microphone initialization failed:",
            error
        );

        alert(
            "Camera or microphone access failed. Please allow camera and microphone permission and try again."
        );
    }
}


// ============================================================
// USER JOINED
// ============================================================

socket.on("user_joined", async () => {
    try {
        console.log("Another user joined. Creating offer...");

        if (!peerConnection) {
            console.error(
                "Peer connection does not exist."
            );
            return;
        }

        const offer = await peerConnection.createOffer();

        await peerConnection.setLocalDescription(
            offer
        );

        console.log("Sending offer...");

        socket.emit("signal", {
            room: ROOM,
            type: "offer",
            offer: offer
        });

    } catch (error) {
        console.error(
            "Error creating offer:",
            error
        );
    }
});


// ============================================================
// SIGNALING
// ============================================================

socket.on("signal", async data => {
    try {
        if (!peerConnection) {
            console.error(
                "Received signal but peer connection is not ready."
            );
            return;
        }

        // ====================================================
        // OFFER
        // ====================================================

        if (data.type === "offer") {
            console.log("Offer received.");

            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(data.offer)
            );

            const answer =
                await peerConnection.createAnswer();

            await peerConnection.setLocalDescription(
                answer
            );

            console.log("Sending answer...");

            socket.emit("signal", {
                room: ROOM,
                type: "answer",
                answer: answer
            });
        }

        // ====================================================
        // ANSWER
        // ====================================================

        else if (data.type === "answer") {
            console.log("Answer received.");

            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(data.answer)
            );
        }

        // ====================================================
        // ICE CANDIDATE
        // ====================================================

        else if (data.type === "ice-candidate") {
            console.log(
                "ICE candidate received."
            );

            try {
                await peerConnection.addIceCandidate(
                    new RTCIceCandidate(
                        data.candidate
                    )
                );
            } catch (error) {
                console.error(
                    "Error adding ICE candidate:",
                    error
                );
            }
        }

    } catch (error) {
        console.error(
            "Signaling error:",
            error
        );
    }
});


// ============================================================
// MUTE / UNMUTE
// ============================================================

const muteBtn =
    document.getElementById("muteBtn");

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
                    track.enabled = !isMuted;
                });

            muteBtn.textContent =
                isMuted
                    ? "Unmute"
                    : "Mute";
        }
    );
}


// ============================================================
// CAMERA ON / OFF
// ============================================================

const videoBtn =
    document.getElementById("videoBtn");

if (videoBtn) {
    videoBtn.addEventListener(
        "click",
        () => {

            if (!localStream) {
                return;
            }

            isVideoOff = !isVideoOff;

            localStream
                .getVideoTracks()
                .forEach(track => {
                    track.enabled = !isVideoOff;
                });

            videoBtn.textContent =
                isVideoOff
                    ? "Turn On Video"
                    : "Turn Off Video";
        }
    );
}


// ============================================================
// SCREEN SHARING
// ============================================================

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
                    console.error(
                        "Peer connection not ready."
                    );
                    return;
                }

                // Start screen sharing
                screenStream =
                    await navigator.mediaDevices
                        .getDisplayMedia({
                            video: true
                        });

                const screenTrack =
                    screenStream
                        .getVideoTracks()[0];

                // Find camera video sender
                const sender =
                    peerConnection
                        .getSenders()
                        .find(
                            s =>
                                s.track &&
                                s.track.kind ===
                                "video"
                        );

                // Replace camera with screen
                if (sender) {
                    await sender.replaceTrack(
                        screenTrack
                    );
                }

                // Show screen locally
                localVideo.srcObject =
                    screenStream;

                // When user stops screen sharing
                screenTrack.onended =
                    async () => {

                        console.log(
                            "Screen sharing stopped."
                        );

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
                    "Screen share failed or cancelled:",
                    error
                );
            }
        }
    );
}


// ============================================================
// END CALL
// ============================================================

const endCallBtn =
    document.getElementById(
        "endCallBtn"
    );

if (endCallBtn) {

    endCallBtn.addEventListener(
        "click",
        () => {

            console.log(
                "Ending call..."
            );

            // Tell server we left
            socket.emit("leave", {
                room: ROOM
            });

            // Stop camera/microphone
            if (localStream) {

                localStream
                    .getTracks()
                    .forEach(track => {
                        track.stop();
                    });
            }

            // Stop screen sharing
            if (screenStream) {

                screenStream
                    .getTracks()
                    .forEach(track => {
                        track.stop();
                    });
            }

            // Close peer connection
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }

            // Remove video streams
            if (localVideo) {
                localVideo.srcObject = null;
            }

            if (remoteVideo) {
                remoteVideo.srcObject = null;
            }

            // Return to dashboard
            window.location.href =
                "/dashboard";
        }
    );
}


// ============================================================
// SOCKET CONNECTION DEBUGGING
// ============================================================

socket.on("connect", () => {
    console.log(
        "Socket.IO connected:",
        socket.id
    );
});

socket.on("disconnect", reason => {
    console.log(
        "Socket.IO disconnected:",
        reason
    );
});

socket.on("connect_error", error => {
    console.error(
        "Socket.IO connection error:",
        error
    );
});


// ============================================================
// START
// ============================================================

init();
