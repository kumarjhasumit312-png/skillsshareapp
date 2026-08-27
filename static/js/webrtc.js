// Basic 1-to-1 WebRTC video call with Socket.IO signaling.
// STUN server used for NAT traversal in dev/testing.
// For real-world reliability across different networks, a TURN server
// should be added here (see iceServers array) once deployed.

const socket = io();
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const config = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
        // Example once you have a TURN server running:
        // { urls: "turn:your-turn-server:3478", username: "user", credential: "pass" }
    ]
};

let localStream = null;
let screenStream = null;
let peerConnection = null;
let isMuted = false;
let isVideoOff = false;

async function init() {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    // Create the peer connection and wire up ALL handlers BEFORE telling the
    // server we've joined. Otherwise, if a "user_joined"/"signal" event comes
    // back quickly, peerConnection may still be null and the offer/answer
    // step silently fails.
    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
        // Some browsers block autoplay of video-with-audio until there's
        // been a user gesture. Explicitly call play() and log if blocked,
        // instead of silently showing a black video.
        remoteVideo.play().catch(err => {
            console.warn("Remote video autoplay blocked, click page to allow:", err);
        });
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("signal", { room: ROOM, type: "ice-candidate", candidate: event.candidate });
        }
    };

    // Handy for debugging connection issues in the browser console.
    peerConnection.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", peerConnection.iceConnectionState);
    };

    socket.emit("join", { room: ROOM });
}

socket.on("user_joined", async () => {
    // The person already in the room creates the offer when someone new joins
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("signal", { room: ROOM, type: "offer", offer });
});

socket.on("signal", async (data) => {
    if (data.type === "offer") {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit("signal", { room: ROOM, type: "answer", answer });
    } else if (data.type === "answer") {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.type === "ice-candidate") {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
            console.error("Error adding ICE candidate", err);
        }
    }
});

document.getElementById("muteBtn").addEventListener("click", () => {
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
    document.getElementById("muteBtn").textContent = isMuted ? "Unmute" : "Mute";
});

document.getElementById("videoBtn").addEventListener("click", () => {
    isVideoOff = !isVideoOff;
    localStream.getVideoTracks().forEach(track => track.enabled = !isVideoOff);
    document.getElementById("videoBtn").textContent = isVideoOff ? "Turn On Video" : "Turn Off Video";
});

document.getElementById("screenShareBtn").addEventListener("click", async () => {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === "video");
        if (sender) sender.replaceTrack(screenTrack);
        localVideo.srcObject = screenStream;

        screenTrack.onended = () => {
            // revert back to camera when screen share stops
            const camTrack = localStream.getVideoTracks()[0];
            if (sender) sender.replaceTrack(camTrack);
            localVideo.srcObject = localStream;
        };
    } catch (err) {
        console.error("Screen share failed or was cancelled", err);
    }
});

document.getElementById("endCallBtn").addEventListener("click", () => {
    socket.emit("leave", { room: ROOM });
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (peerConnection) peerConnection.close();
    window.location.href = "/dashboard";
});

init();
