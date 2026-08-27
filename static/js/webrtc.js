// ==========================================================
// SkillSwap 1-to-1 WebRTC Video Calling
// Socket.IO = Signaling
// STUN + TURN = NAT Traversal
// ==========================================================

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


// ==========================================================
// IMPORTANT: STUN + TURN
// ==========================================================

const config = {
    iceServers: [
        {
            urls: "stun:stun.relay.metered.ca:80"
        },
        {
            urls: "turn:global.relay.metered.ca:80",
            username: "41c8ed29a3cc3a4362f10c2d",
            credential: "UuCFfCusf019HIM1"
        },
        {
            urls: "turn:global.relay.metered.ca:80?transport=tcp",
            username: "41c8ed29a3cc3a4362f10c2d",
            credential: "UuCFfCusf019HIM1"
        },
        {
            urls: "turn:global.relay.metered.ca:443",
            username: "41c8ed29a3cc3a4362f10c2d",
            credential: "UuCFfCusf019HIM1"
        },
        {
            urls: "turns:global.relay.metered.ca:443?transport=tcp",
            username: "41c8ed29a3cc3a4362f10c2d",
            credential: "UuCFfCusf019HIM1"
        }
    ]
};


// ==========================================================
// VARIABLES
// ==========================================================

let localStream = null;
let screenStream = null;
let peerConnection = null;

let isMuted = false;
let isVideoOff = false;

let remoteDescriptionSet = false;
let pendingIceCandidates = [];


// ==========================================================
// CHECK ROOM
// ==========================================================

if (typeof ROOM === "undefined") {
    console.error("ROOM is not defined.");
} else {
    console.log("Meeting room:", ROOM);
}


// ==========================================================
// SOCKET CONNECT
// ==========================================================

socket.on("connect", () => {

    console.log("=================================");
    console.log("SOCKET.IO CONNECTED");
    console.log("Socket ID:", socket.id);
    console.log("ROOM:", ROOM);
    console.log("=================================");

    socket.emit("join", {
        room: ROOM
    });
});


// ==========================================================
// SOCKET DISCONNECT
// ==========================================================

socket.on("disconnect", reason => {

    console.warn(
        "Socket.IO disconnected:",
        reason
    );

});


// ==========================================================
// SOCKET ERROR
// ==========================================================

socket.on("connect_error", error => {

    console.error(
        "Socket.IO connection error:",
        error
    );

});


// ==========================================================
// CREATE PEER CONNECTION
// ==========================================================

function createPeerConnection() {

    console.log(
        "Creating RTCPeerConnection..."
    );

    peerConnection =
        new RTCPeerConnection(config);


    // ======================================================
    // LOCAL ICE CANDIDATE
    // ======================================================

    peerConnection.onicecandidate = event => {

        if (!event.candidate) {
            return;
        }

        console.log(
            "Sending ICE:",
            event.candidate.candidate
        );

        socket.emit("signal", {

            room: ROOM,

            type: "ice-candidate",

            candidate: event.candidate

        });
    };


    // ======================================================
    // REMOTE VIDEO
    // ======================================================

    peerConnection.ontrack = event => {

        console.log(
            "================================="
        );

        console.log(
            "REMOTE TRACK RECEIVED"
        );

        console.log(
            "================================="
        );

        if (
            event.streams &&
            event.streams[0]
        ) {

            remoteVideo.srcObject =
                event.streams[0];

            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;

            remoteVideo.play().catch(error => {

                console.warn(
                    "Remote video play:",
                    error
                );

            });
        }
    };


    // ======================================================
    // ICE STATE
    // ======================================================

    peerConnection.oniceconnectionstatechange = () => {

        console.log(
            "ICE state:",
            peerConnection.iceConnectionState
        );

        if (
            peerConnection.iceConnectionState ===
            "connected"
        ) {

            console.log(
                "ICE CONNECTED"
            );

        }

        if (
            peerConnection.iceConnectionState ===
            "completed"
        ) {

            console.log(
                "ICE COMPLETED"
            );

        }

        if (
            peerConnection.iceConnectionState ===
            "failed"
        ) {

            console.error(
                "ICE FAILED"
            );

        }

    };


    // ======================================================
    // CONNECTION STATE
    // ======================================================

    peerConnection.onconnectionstatechange = () => {

        console.log(
            "WebRTC state:",
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
                "WEBRTC CALL CONNECTED"
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


    // ======================================================
    // SIGNALING STATE
    // ======================================================

    peerConnection.onsignalingstatechange = () => {

        console.log(
            "Signaling state:",
            peerConnection.signalingState
        );

    };


    // ======================================================
    // ADD LOCAL CAMERA + MICROPHONE
    // ======================================================

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
// CAMERA + MICROPHONE
// ==========================================================

async function init() {

    try {

        console.log(
            "Starting camera and microphone..."
        );

        localStream =
            await navigator.mediaDevices.getUserMedia({

                video: true,

                audio: true

            });


        // Local video
        if (localVideo) {

            localVideo.srcObject =
                localStream;

            localVideo.autoplay = true;
            localVideo.muted = true;
            localVideo.playsInline = true;

            await localVideo.play().catch(() => {});

        }


        console.log(
            "Camera + microphone ready."
        );


        // Create WebRTC connection
        createPeerConnection();


    } catch (error) {

        console.error(
            "getUserMedia ERROR:",
            error
        );

        alert(
            "Camera aur microphone permission allow karo."
        );

    }

}


// ==========================================================
// OTHER USER JOINED
// ==========================================================

socket.on(
    "user_joined",
    async data => {

        console.log(
            "================================="
        );

        console.log(
            "OTHER USER JOINED"
        );

        console.log(
            data
        );

        console.log(
            "================================="
        );


        try {

            if (!peerConnection) {

                createPeerConnection();

            }


            // Existing user creates OFFER
            console.log(
                "Creating OFFER..."
            );


            const offer =
                await peerConnection.createOffer();


            await peerConnection.setLocalDescription(
                offer
            );


            console.log(
                "Sending OFFER..."
            );


            socket.emit(
                "signal",
                {

                    room: ROOM,

                    type: "offer",

                    offer: offer

                }
            );


        } catch (error) {

            console.error(
                "Offer error:",
                error
            );

        }

    }
);


// ==========================================================
// SIGNAL
// ==========================================================

socket.on(
    "signal",
    async data => {

        console.log(
            "SIGNAL:",
            data.type
        );


        try {

            if (!peerConnection) {

                createPeerConnection();

            }


            // =================================================
            // OFFER
            // =================================================

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


                socket.emit(
                    "signal",
                    {

                        room: ROOM,

                        type: "answer",

                        answer: answer

                    }
                );

            }


            // =================================================
            // ANSWER
            // =================================================

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


            // =================================================
            // ICE CANDIDATE
            // =================================================

            else if (
                data.type === "ice-candidate"
            ) {

                const candidate =
                    new RTCIceCandidate(
                        data.candidate
                    );


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
                "SIGNAL ERROR:",
                error
            );

        }

    }
);


// ==========================================================
// FLUSH ICE
// ==========================================================

async function flushPendingIceCandidates() {

    if (!peerConnection) {
        return;
    }

    if (!peerConnection.remoteDescription) {
        return;
    }


    console.log(
        "Flushing ICE candidates:",
        pendingIceCandidates.length
    );


    for (
        const candidate
        of pendingIceCandidates
    ) {

        try {

            await peerConnection.addIceCandidate(
                candidate
            );

        } catch (error) {

            console.error(
                "ICE candidate error:",
                error
            );

        }

    }


    pendingIceCandidates = [];

}


// ==========================================================
// USER LEFT
// ==========================================================

socket.on(
    "user_left",
    () => {

        console.log(
            "Other user left."
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

    }
);


// ==========================================================
// MUTE
// ==========================================================

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
// CAMERA ON/OFF
// ==========================================================

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

if (screenShareBtn) {

    screenShareBtn.addEventListener(
        "click",
        async () => {

            try {

                if (!peerConnection) {

                    console.warn(
                        "Peer connection not ready."
                    );

                    return;

                }


                screenStream =
                    await navigator.mediaDevices
                        .getDisplayMedia({

                            video: true,

                            audio: false

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

function endCall() {

    console.log(
        "Ending call..."
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


    if (localVideo) {

        localVideo.srcObject = null;

    }


    if (remoteVideo) {

        remoteVideo.srcObject = null;

    }


    socket.disconnect();

}


// ==========================================================
// END CALL BUTTON
// ==========================================================

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


// ==========================================================
// START
// ==========================================================

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        init
    );

} else {

    init();

}
