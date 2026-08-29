```javascript
// ============================================================
// SkillSwap - Stable 1-to-1 WebRTC
// Flask-SocketIO = Signaling
// STUN + TURN = NAT Traversal
// ============================================================

const socket = io({
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000
});

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const muteBtn = document.getElementById("muteBtn");
const videoBtn = document.getElementById("videoBtn");
const screenShareBtn = document.getElementById("screenShareBtn");
const endCallBtn = document.getElementById("endCallBtn");

const ROOM = window.ROOM || null;


// ============================================================
// STUN + TURN
// YOUR EXISTING WORKING CREDENTIALS
// ============================================================

const rtcConfig = {
    iceServers: [
        {
            urls: "stun:free.expressturn.com:3478"
        },
        {
            urls: "turn:free.expressturn.com:3478?transport=udp",
            username: "0000000002103368970",
            credential: "PO46DCtC1zTOP21ZixuEoyebRF0="
        },
        {
            urls: "turn:free.expressturn.com:3478?transport=tcp",
            username: "0000000002103368970",
            credential: "PO46DCtC1zTOP21ZixuEoyebRF0="
        }
    ]
};


// ============================================================
// VARIABLES
// ============================================================

let localStream = null;
let screenStream = null;
let peerConnection = null;

let remoteDescriptionSet = false;
let pendingIceCandidates = [];

let isMuted = false;
let isVideoOff = false;

let mediaReady = false;
let roomJoined = false;
let callEnded = false;

// Negotiation protection
let makingOffer = false;
let processingOffer = false;
let processingAnswer = false;

// Prevent duplicate offers
let offerSentForCurrentJoin = false;

// ICE restart protection
let iceRestartInProgress = false;
let lastIceRestartTime = 0;


// ============================================================
// DEBUG
// ============================================================

console.log("======================================");
console.log("SkillSwap WebRTC starting");
console.log("ROOM:", ROOM);
console.log("======================================");


// ============================================================
// CAMERA + MICROPHONE
// ============================================================

async function getLocalMedia() {

    if (mediaReady && localStream) {
        return localStream;
    }

    console.log("Requesting camera + microphone...");

    try {

        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: {
                    ideal: 1280
                },
                height: {
                    ideal: 720
                },
                facingMode: "user"
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        console.log("Camera + microphone obtained.");

        if (localVideo) {

            localVideo.srcObject = localStream;
            localVideo.muted = true;
            localVideo.autoplay = true;
            localVideo.playsInline = true;

            try {
                await localVideo.play();
            } catch (error) {
                console.warn("Local video autoplay:", error);
            }
        }

        mediaReady = true;

        return localStream;

    } catch (error) {

        console.error("getUserMedia failed:", error);

        alert(
            "Camera aur microphone permission allow karo.\n\n" +
            "Agar permission pehle deny ki thi to browser settings me jaakar Camera aur Microphone Allow karo."
        );

        throw error;
    }
}


// ============================================================
// CREATE PEER CONNECTION
// ============================================================

function createPeerConnection() {

    if (peerConnection) {
        console.log("PeerConnection already exists.");
        return peerConnection;
    }

    console.log("Creating RTCPeerConnection...");

    peerConnection = new RTCPeerConnection(rtcConfig);

    remoteDescriptionSet = false;
    pendingIceCandidates = [];

    // --------------------------------------------------------
    // LOCAL ICE
    // --------------------------------------------------------

    peerConnection.onicecandidate = (event) => {

        if (!event.candidate) {
            console.log("ICE gathering completed.");
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


    // --------------------------------------------------------
    // REMOTE MEDIA
    // --------------------------------------------------------

    peerConnection.ontrack = async (event) => {

        console.log(
            "REMOTE TRACK RECEIVED:",
            event.track.kind
        );

        if (!remoteVideo) {
            return;
        }

        let remoteStream;

        if (event.streams && event.streams[0]) {

            remoteStream = event.streams[0];

        } else {

            if (!remoteVideo.srcObject) {
                remoteVideo.srcObject = new MediaStream();
            }

            remoteStream = remoteVideo.srcObject;

            const exists = remoteStream
                .getTracks()
                .some(track => track.id === event.track.id);

            if (!exists) {
                remoteStream.addTrack(event.track);
            }
        }

        if (remoteVideo.srcObject !== remoteStream) {
            remoteVideo.srcObject = remoteStream;
        }

        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.muted = false;
        remoteVideo.volume = 1.0;

        try {

            await remoteVideo.play();

            console.log("REMOTE VIDEO/AUDIO PLAYING");

        } catch (error) {

            console.warn(
                "Remote video autoplay blocked:",
                error
            );

            const playRemote = async () => {

                try {
                    await remoteVideo.play();
                    console.log(
                        "Remote media started after user interaction."
                    );
                } catch (e) {
                    console.warn(
                        "Remote play retry failed:",
                        e
                    );
                }
            };

            document.addEventListener(
                "click",
                playRemote,
                { once: true }
            );

            document.addEventListener(
                "touchstart",
                playRemote,
                { once: true }
            );
        }
    };


    // --------------------------------------------------------
    // ICE CONNECTION STATE
    // --------------------------------------------------------

    peerConnection.oniceconnectionstatechange = () => {

        if (!peerConnection) {
            return;
        }

        const state = peerConnection.iceConnectionState;

        console.log(
            "ICE connection state:",
            state
        );

        if (
            state === "connected" ||
            state === "completed"
        ) {

            console.log("======================================");
            console.log("WEBRTC ICE CONNECTED");
            console.log("======================================");

            iceRestartInProgress = false;
        }

        if (state === "checking") {

            console.log(
                "ICE is checking available network paths..."
            );
        }

        if (state === "disconnected") {

            console.warn(
                "ICE temporarily disconnected."
            );

            // Do not immediately restart.
            // Temporary disconnect can recover.
        }

        if (state === "failed") {

            console.error(
                "ICE CONNECTION FAILED"
            );

            scheduleIceRestart();
        }
    };


    // --------------------------------------------------------
    // CONNECTION STATE
    // --------------------------------------------------------

    peerConnection.onconnectionstatechange = () => {

        if (!peerConnection) {
            return;
        }

        const state = peerConnection.connectionState;

        console.log(
            "WebRTC connection state:",
            state
        );

        if (state === "connected") {

            console.log("======================================");
            console.log("VIDEO CALL CONNECTED");
            console.log("AUDIO + VIDEO SHOULD NOW WORK");
            console.log("======================================");
        }

        if (state === "failed") {

            console.error(
                "WEBRTC CONNECTION FAILED"
            );

            scheduleIceRestart();
        }

        if (state === "disconnected") {

            console.warn(
                "WebRTC temporarily disconnected."
            );
        }
    };


    // --------------------------------------------------------
    // SIGNALING STATE
    // --------------------------------------------------------

    peerConnection.onsignalingstatechange = () => {

        if (!peerConnection) {
            return;
        }

        console.log(
            "Signaling state:",
            peerConnection.signalingState
        );
    };


    // --------------------------------------------------------
    // ADD CAMERA + MICROPHONE TRACKS
    // --------------------------------------------------------

    if (!localStream) {

        console.error(
            "Cannot add local tracks because localStream is missing."
        );

        return peerConnection;
    }

    localStream.getTracks().forEach((track) => {

        console.log(
            "Adding local track:",
            track.kind,
            track.id
        );

        peerConnection.addTrack(
            track,
            localStream
        );
    });

    console.log(
        "Local camera + microphone tracks added."
    );

    return peerConnection;
}


// ============================================================
// JOIN ROOM
// ============================================================

async function joinMeetingRoom() {

    if (roomJoined) {
        return;
    }

    if (!ROOM) {

        console.error(
            "ROOM is missing."
        );

        return;
    }

    if (callEnded) {
        return;
    }

    try {

        await getLocalMedia();

        if (!peerConnection) {
            createPeerConnection();
        }

        if (!socket.connected) {

            console.log(
                "Socket not connected yet. Waiting..."
            );

            return;
        }

        console.log(
            "Everything ready. Joining room:",
            ROOM
        );

        socket.emit("join", {
            room: ROOM
        });

        roomJoined = true;
        offerSentForCurrentJoin = false;

        console.log(
            "ROOM JOINED:",
            ROOM
        );

    } catch (error) {

        console.error(
            "Could not join meeting:",
            error
        );
    }
}


// ============================================================
// SOCKET CONNECT
// ============================================================

socket.on("connect", async () => {

    console.log("======================================");
    console.log("SOCKET.IO CONNECTED");
    console.log("Socket ID:", socket.id);
    console.log("======================================");

    if (callEnded) {
        return;
    }

    roomJoined = false;
    offerSentForCurrentJoin = false;

    await joinMeetingRoom();
});


// ============================================================
// SOCKET DISCONNECT
// ============================================================

socket.on("disconnect", (reason) => {

    console.warn(
        "Socket disconnected:",
        reason
    );

    roomJoined = false;
});


// ============================================================
// SOCKET ERROR
// ============================================================

socket.on("connect_error", (error) => {

    console.error(
        "Socket.IO connection error:",
        error
    );
});


// ============================================================
// OTHER USER JOINED
// EXISTING USER CREATES OFFER
// ============================================================

socket.on("user_joined", async (data) => {

    console.log("======================================");
    console.log("OTHER USER JOINED");
    console.log(data);
    console.log("======================================");

    if (callEnded) {
        return;
    }

    // Prevent duplicate user_joined events
    if (offerSentForCurrentJoin) {

        console.warn(
            "Offer already sent. Ignoring duplicate user_joined."
        );

        return;
    }

    if (makingOffer) {

        console.warn(
            "Already creating an offer."
        );

        return;
    }

    if (!socket.connected) {

        console.warn(
            "Socket disconnected. Cannot create offer."
        );

        return;
    }

    try {

        await getLocalMedia();

        if (!peerConnection) {
            createPeerConnection();
        }

        // OFFER must only be created from stable state.
        if (
            peerConnection.signalingState !== "stable"
        ) {

            console.warn(
                "PeerConnection is not stable:",
                peerConnection.signalingState
            );

            return;
        }

        makingOffer = true;

        console.log(
            "Number of senders:",
            peerConnection.getSenders().length
        );

        console.log(
            "Creating OFFER..."
        );

        const offer =
            await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });

        await peerConnection.setLocalDescription(
            offer
        );

        console.log(
            "Local OFFER set."
        );

        offerSentForCurrentJoin = true;

        console.log(
            "Sending OFFER..."
        );

        socket.emit("signal", {
            room: ROOM,
            type: "offer",
            offer: peerConnection.localDescription
        });

    } catch (error) {

        console.error(
            "Offer creation failed:",
            error
        );

        offerSentForCurrentJoin = false;

    } finally {

        makingOffer = false;
    }
});


// ============================================================
// SIGNAL
// OFFER / ANSWER / ICE
// ============================================================

socket.on("signal", async (data) => {

    console.log(
        "SIGNAL RECEIVED:",
        data.type
    );

    if (callEnded) {
        return;
    }

    try {

        await getLocalMedia();

        if (!peerConnection) {
            createPeerConnection();
        }


        // ====================================================
        // OFFER
        // ====================================================

        if (data.type === "offer") {

            console.log(
                "Receiving OFFER..."
            );

            // Do not process two offers simultaneously.
            if (processingOffer) {

                console.warn(
                    "Already processing an OFFER. Ignoring duplicate."
                );

                return;
            }

            // Do not overwrite an active local offer.
            if (
                peerConnection.signalingState !== "stable"
            ) {

                console.warn(
                    "Ignoring OFFER because signaling state is:",
                    peerConnection.signalingState
                );

                return;
            }

            processingOffer = true;

            try {

                await peerConnection.setRemoteDescription(
                    new RTCSessionDescription(data.offer)
                );

                remoteDescriptionSet = true;

                console.log(
                    "Remote OFFER set."
                );

                await flushPendingIceCandidates();

                console.log(
                    "Creating ANSWER..."
                );

                const answer =
                    await peerConnection.createAnswer({
                        offerToReceiveAudio: true,
                        offerToReceiveVideo: true
                    });

                await peerConnection.setLocalDescription(
                    answer
                );

                console.log(
                    "Local ANSWER set."
                );

                console.log(
                    "Sending ANSWER..."
                );

                socket.emit("signal", {
                    room: ROOM,
                    type: "answer",
                    answer: peerConnection.localDescription
                });

            } finally {

                processingOffer = false;
            }

            return;
        }


        // ====================================================
        // ANSWER
        // ====================================================

        if (data.type === "answer") {

            console.log(
                "Receiving ANSWER..."
            );

            // Only accept answer when our offer is active.
            if (
                peerConnection.signalingState !==
                "have-local-offer"
            ) {

                console.warn(
                    "Ignoring answer because signaling state is:",
                    peerConnection.signalingState
                );

                return;
            }

            if (processingAnswer) {

                console.warn(
                    "Already processing an ANSWER."
                );

                return;
            }

            processingAnswer = true;

            try {

                await peerConnection.setRemoteDescription(
                    new RTCSessionDescription(data.answer)
                );

                remoteDescriptionSet = true;

                console.log(
                    "Remote ANSWER set."
                );

                await flushPendingIceCandidates();

            } finally {

                processingAnswer = false;
            }

            return;
        }


        // ====================================================
        // ICE CANDIDATE
        // ====================================================

        if (data.type === "ice-candidate") {

            if (!data.candidate) {
                return;
            }

            const candidate =
                new RTCIceCandidate(data.candidate);

            if (
                !remoteDescriptionSet ||
                !peerConnection.remoteDescription
            ) {

                console.log(
                    "Queueing ICE candidate."
                );

                pendingIceCandidates.push(candidate);

            } else {

                console.log(
                    "Adding ICE candidate."
                );

                try {

                    await peerConnection.addIceCandidate(
                        candidate
                    );

                } catch (error) {

                    console.error(
                        "ICE candidate failed:",
                        error
                    );
                }
            }

            return;
        }

    } catch (error) {

        console.error(
            "SIGNAL HANDLING ERROR:",
            error
        );
    }
});


// ============================================================
// FLUSH QUEUED ICE CANDIDATES
// ============================================================

async function flushPendingIceCandidates() {

    if (!peerConnection) {
        return;
    }

    if (!peerConnection.remoteDescription) {
        return;
    }

    console.log(
        "Flushing queued ICE:",
        pendingIceCandidates.length
    );

    const candidates =
        [...pendingIceCandidates];

    pendingIceCandidates = [];

    for (const candidate of candidates) {

        try {

            await peerConnection.addIceCandidate(
                candidate
            );

        } catch (error) {

            console.error(
                "Queued ICE candidate failed:",
                error
            );
        }
    }
}


// ============================================================
// CONTROLLED ICE RESTART
// ============================================================

function scheduleIceRestart() {

    if (callEnded) {
        return;
    }

    if (!peerConnection) {
        return;
    }

    if (!socket.connected) {
        return;
    }

    if (
        makingOffer ||
        processingOffer ||
        processingAnswer
    ) {

        console.warn(
            "ICE restart postponed because negotiation is busy."
        );

        setTimeout(() => {
            scheduleIceRestart();
        }, 2000);

        return;
    }

    const now = Date.now();

    // Don't restart repeatedly within 10 seconds.
    if (
        now - lastIceRestartTime < 10000
    ) {

        console.warn(
            "ICE restart skipped: restarted recently."
        );

        return;
    }

    if (
        peerConnection.signalingState !== "stable"
    ) {

        console.warn(
            "ICE restart postponed. Signaling state:",
            peerConnection.signalingState
        );

        return;
    }

    restartIce();
}


async function restartIce() {

    if (!peerConnection) {
        return;
    }

    if (callEnded) {
        return;
    }

    if (!socket.connected) {
        return;
    }

    if (iceRestartInProgress) {

        console.warn(
            "ICE restart already in progress."
        );

        return;
    }

    if (
        peerConnection.signalingState === "closed"
    ) {
        return;
    }

    if (
        peerConnection.signalingState !== "stable"
    ) {

        console.warn(
            "Cannot restart ICE. Signaling state:",
            peerConnection.signalingState
        );

        return;
    }

    try {

        iceRestartInProgress = true;
        makingOffer = true;
        lastIceRestartTime = Date.now();

        console.log(
            "Attempting controlled ICE restart..."
        );

        const offer =
            await peerConnection.createOffer({
                iceRestart: true
            });

        await peerConnection.setLocalDescription(
            offer
        );

        socket.emit("signal", {
            room: ROOM,
            type: "offer",
            offer: peerConnection.localDescription
        });

        console.log(
            "ICE restart OFFER sent."
        );

    } catch (error) {

        console.error(
            "ICE restart failed:",
            error
        );

    } finally {

        makingOffer = false;

        setTimeout(() => {
            iceRestartInProgress = false;
        }, 3000);
    }
}


// ============================================================
// USER LEFT
// ============================================================

socket.on("user_left", () => {

    console.log(
        "Other user left the meeting."
    );

    if (remoteVideo) {
        remoteVideo.srcObject = null;
    }

    if (peerConnection) {

        peerConnection.close();

        peerConnection = null;
    }

    remoteDescriptionSet = false;
    pendingIceCandidates = [];

    makingOffer = false;
    processingOffer = false;
    processingAnswer = false;

    offerSentForCurrentJoin = false;
    iceRestartInProgress = false;
});


// ============================================================
// MUTE / UNMUTE
// ============================================================

if (muteBtn) {

    muteBtn.addEventListener("click", () => {

        if (!localStream) {
            return;
        }

        isMuted = !isMuted;

        localStream
            .getAudioTracks()
            .forEach((track) => {
                track.enabled = !isMuted;
            });

        muteBtn.textContent =
            isMuted
                ? "Unmute"
                : "Mute";
    });
}


// ============================================================
// CAMERA ON / OFF
// ============================================================

if (videoBtn) {

    videoBtn.addEventListener("click", () => {

        if (!localStream) {
            return;
        }

        isVideoOff = !isVideoOff;

        localStream
            .getVideoTracks()
            .forEach((track) => {
                track.enabled = !isVideoOff;
            });

        videoBtn.textContent =
            isVideoOff
                ? "Turn On Video"
                : "Turn Off Video";
    });
}


// ============================================================
// SCREEN SHARE
// ============================================================

if (screenShareBtn) {

    screenShareBtn.addEventListener(
        "click",
        async () => {

            try {

                if (!peerConnection) {

                    console.warn(
                        "PeerConnection not ready."
                    );

                    return;
                }

                screenStream =
                    await navigator.mediaDevices.getDisplayMedia({
                        video: true,
                        audio: false
                    });

                const screenTrack =
                    screenStream.getVideoTracks()[0];

                const sender =
                    peerConnection
                        .getSenders()
                        .find(
                            (s) =>
                                s.track &&
                                s.track.kind === "video"
                        );

                if (!sender) {

                    console.error(
                        "Video sender not found."
                    );

                    screenStream
                        .getTracks()
                        .forEach(track => track.stop());

                    screenStream = null;

                    return;
                }

                await sender.replaceTrack(
                    screenTrack
                );

                localVideo.srcObject =
                    screenStream;

                screenTrack.onended =
                    async () => {

                        const cameraTrack =
                            localStream
                                ? localStream.getVideoTracks()[0]
                                : null;

                        if (cameraTrack) {

                            await sender.replaceTrack(
                                cameraTrack
                            );

                            localVideo.srcObject =
                                localStream;
                        }

                        screenStream = null;
                    };

            } catch (error) {

                console.error(
                    "Screen share failed:",
                    error
                );
            }
        }
    );
}


// ============================================================
// END CALL
// ============================================================

function endCall() {

    callEnded = true;

    console.log(
        "Ending call..."
    );

    if (socket.connected) {

        socket.emit("leave", {
            room: ROOM
        });
    }

    if (localStream) {

        localStream
            .getTracks()
            .forEach((track) => {
                track.stop();
            });
    }

    if (screenStream) {

        screenStream
            .getTracks()
            .forEach((track) => {
                track.stop();
            });
    }

    if (peerConnection) {

        peerConnection.close();

        peerConnection = null;
    }

    if (localVideo) {
        localVideo.srcObject = null;
    }

    if (remoteVideo) {
        remoteVideo.srcObject = null;
    }

    socket.disconnect();
}


// ============================================================
// END CALL BUTTON
// ============================================================

if (endCallBtn) {

    endCallBtn.addEventListener(
        "click",
        () => {

            endCall();

            window.location.href =
                "/dashboard";
        }
    );
}


// ============================================================
// START
// ============================================================

async function start() {

    try {

        await getLocalMedia();

        createPeerConnection();

        if (socket.connected) {
            await joinMeetingRoom();
        }

    } catch (error) {

        console.error(
            "Meeting startup failed:",
            error
        );
    }
}

start();
```
