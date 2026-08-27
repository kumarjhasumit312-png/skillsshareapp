// Basic 1-to-1 WebRTC video call with Socket.IO signaling.
// STUN server used for NAT traversal in dev/testing.
// TURN server (Metered.ca) added below for reliability across
// different networks (mobile data, different WiFi, corporate networks etc).

const socket = io();
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const config = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
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

async function init() {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    // Create the peer connection and wire up ALL handlers BEFORE telling the
    // server we've
