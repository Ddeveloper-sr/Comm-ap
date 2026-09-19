// WebRTC voice/video chat, coordinated via a signaling server (see /signaling-server).
// IMPORTANT: Update SIGNALING_SERVER_URL below once you deploy the signaling server
// (e.g. to Render or Railway). See signaling-server/README.md for instructions.

const SIGNALING_SERVER_URL = "https://YOUR-SIGNALING-SERVER-URL.onrender.com";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

let socket = null;
let localStream = null;
let peers = {}; // peerId -> RTCPeerConnection
let currentUser = null;
let currentRoomId = null;
let isMuted = false;
let isVideoOn = false;

export function initVoice(user) {
  currentUser = user;
}

async function connectSocket() {
  if (socket && socket.connected) return socket;

  // Loaded from CDN in app.html via <script> tag (see index.html script tags)
  socket = io(SIGNALING_SERVER_URL);

  socket.on("connect", () => {
    console.log("Connected to signaling server");
  });

  socket.on("user-joined", async ({ peerId, username }) => {
    addParticipantLabel(peerId, username);
    const pc = createPeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("offer", { target: peerId, offer, roomId: currentRoomId });
  });

  socket.on("offer", async ({ from, offer, username }) => {
    addParticipantLabel(from, username);
    const pc = createPeerConnection(from);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("answer", { target: from, answer, roomId: currentRoomId });
  });

  socket.on("answer", async ({ from, answer }) => {
    const pc = peers[from];
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
  });

  socket.on("ice-candidate", async ({ from, candidate }) => {
    const pc = peers[from];
    if (pc && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Error adding ICE candidate", err);
      }
    }
  });

  socket.on("user-left", ({ peerId }) => {
    if (peers[peerId]) {
      peers[peerId].close();
      delete peers[peerId];
    }
    removeRemoteVideo(peerId);
    removeParticipantLabel(peerId);
  });

  return socket;
}

function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection(ICE_SERVERS);

  if (localStream) {
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", { target: peerId, candidate: event.candidate, roomId: currentRoomId });
    }
  };

  pc.ontrack = (event) => {
    addRemoteVideo(peerId, event.streams[0]);
  };

  peers[peerId] = pc;
  return pc;
}

export async function joinVoiceChannel(serverId, channelId, channelName) {
  currentRoomId = `${serverId}_${channelId}`;
  document.getElementById("voice-status-text").textContent = `Connected to ${channelName}`;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    document.getElementById("voice-status-text").textContent =
      "Microphone access denied. Voice chat needs mic permission.";
    return;
  }

  await connectSocket();
  socket.emit("join-room", {
    roomId: currentRoomId,
    username: currentUser.displayName || currentUser.email
  });
}

export function leaveVoiceChannel() {
  if (socket && currentRoomId) {
    socket.emit("leave-room", { roomId: currentRoomId });
  }
  Object.values(peers).forEach((pc) => pc.close());
  peers = {};
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  currentRoomId = null;
  document.getElementById("video-grid").innerHTML = "";
  document.getElementById("voice-participants").innerHTML = "";
}

export function toggleMute() {
  if (!localStream) return isMuted;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((t) => (t.enabled = !isMuted));
  return isMuted;
}

export async function toggleVideo() {
  isVideoOn = !isVideoOn;
  if (isVideoOn) {
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const videoTrack = camStream.getVideoTracks()[0];
      localStream.addTrack(videoTrack);
      Object.values(peers).forEach((pc) => {
        pc.addTrack(videoTrack, localStream);
      });
      addLocalVideo(camStream);
    } catch (err) {
      isVideoOn = false;
    }
  } else {
    localStream.getVideoTracks().forEach((t) => {
      t.stop();
      localStream.removeTrack(t);
    });
    removeLocalVideo();
  }
  return isVideoOn;
}

function addLocalVideo(stream) {
  const grid = document.getElementById("video-grid");
  let vid = document.getElementById("local-video");
  if (!vid) {
    vid = document.createElement("video");
    vid.id = "local-video";
    vid.autoplay = true;
    vid.muted = true;
    vid.playsInline = true;
    grid.appendChild(vid);
  }
  vid.srcObject = stream;
}

function removeLocalVideo() {
  const vid = document.getElementById("local-video");
  if (vid) vid.remove();
}

function addRemoteVideo(peerId, stream) {
  const grid = document.getElementById("video-grid");
  let vid = document.getElementById("video-" + peerId);
  if (!vid) {
    vid = document.createElement("video");
    vid.id = "video-" + peerId;
    vid.autoplay = true;
    vid.playsInline = true;
    grid.appendChild(vid);
  }
  vid.srcObject = stream;
}

function removeRemoteVideo(peerId) {
  const vid = document.getElementById("video-" + peerId);
  if (vid) vid.remove();
}

function addParticipantLabel(peerId, username) {
  const list = document.getElementById("voice-participants");
  if (document.getElementById("participant-" + peerId)) return;
  const el = document.createElement("div");
  el.id = "participant-" + peerId;
  el.className = "voice-btn";
  el.textContent = username;
  list.appendChild(el);
}

function removeParticipantLabel(peerId) {
  const el = document.getElementById("participant-" + peerId);
  if (el) el.remove();
}
