import {
  auth,
  db,
  onAuthStateChanged,
  signOut,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  where
} from "./firebase-config.js";
import { initVoice, joinVoiceChannel, leaveVoiceChannel, toggleMute, toggleVideo } from "./voice.js";

let currentUser = null;
let currentServerId = null;
let currentChannelId = null;
let currentChannelType = "text";
let unsubscribeMessages = null;
let unsubscribeChannels = null;
let unsubscribeServers = null;

const els = {
  serverIcons: document.getElementById("server-icons"),
  serverRail: document.getElementById("server-rail"),
  currentServerName: document.getElementById("current-server-name"),
  channelList: document.getElementById("channel-list"),
  voiceChannelList: document.getElementById("voice-channel-list"),
  messages: document.getElementById("messages"),
  messageForm: document.getElementById("message-form"),
  messageInput: document.getElementById("message-input"),
  activeChannelLabel: document.getElementById("active-channel-label"),
  currentUsername: document.getElementById("current-username"),
  userAvatar: document.getElementById("user-avatar"),
  btnLogout: document.getElementById("btn-logout"),
  btnAddServer: document.getElementById("btn-add-server"),
  btnAddChannel: document.getElementById("btn-add-channel"),
  membersList: document.getElementById("members-list"),
  textView: document.getElementById("text-view"),
  voiceView: document.getElementById("voice-view"),
  modalAddServer: document.getElementById("modal-add-server"),
  modalAddChannel: document.getElementById("modal-add-channel"),
};

// ---------- Auth guard ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUser = user;
  els.currentUsername.textContent = user.displayName || user.email;
  els.userAvatar.textContent = (user.displayName || user.email)[0].toUpperCase();
  initVoice(user);
  await loadServers();
  await ensureDefaultServer();
});

els.btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// ---------- Servers ----------
async function ensureDefaultServer() {
  const serversSnap = await getDocs(collection(db, "servers"));
  if (serversSnap.empty) {
    await createServer("General Server", true);
  }
}

async function loadServers() {
  if (unsubscribeServers) unsubscribeServers();
  const q = query(collection(db, "servers"), orderBy("createdAt", "asc"));
  unsubscribeServers = onSnapshot(q, (snap) => {
    els.serverIcons.innerHTML = "";
    snap.forEach((docSnap) => {
      const server = docSnap.data();
      const icon = document.createElement("div");
      icon.className = "server-icon";
      icon.title = server.name;
      icon.textContent = server.name.substring(0, 2).toUpperCase();
      icon.dataset.serverId = docSnap.id;
      if (docSnap.id === currentServerId) icon.classList.add("active");
      icon.addEventListener("click", () => selectServer(docSnap.id, server.name));
      els.serverIcons.appendChild(icon);
    });
    // Auto-select first server if none selected
    if (!currentServerId && !snap.empty) {
      const first = snap.docs[0];
      selectServer(first.id, first.data().name);
    }
  });
}

async function createServer(name, isDefault = false) {
  const ref = await addDoc(collection(db, "servers"), {
    name,
    createdAt: Date.now(),
    ownerId: currentUser ? currentUser.uid : "system"
  });
  // Create a default #general text channel and General voice channel
  await addDoc(collection(db, "servers", ref.id, "channels"), {
    name: "general",
    type: "text",
    createdAt: Date.now()
  });
  await addDoc(collection(db, "servers", ref.id, "channels"), {
    name: "General",
    type: "voice",
    createdAt: Date.now()
  });
  return ref.id;
}

function selectServer(serverId, serverName) {
  currentServerId = serverId;
  els.currentServerName.textContent = serverName;
  document.querySelectorAll(".server-icon[data-server-id]").forEach((el) => {
    el.classList.toggle("active", el.dataset.serverId === serverId);
  });
  loadChannels(serverId);
}

els.btnAddServer.addEventListener("click", () => {
  els.modalAddServer.classList.remove("hidden");
});
document.getElementById("cancel-add-server").addEventListener("click", () => {
  els.modalAddServer.classList.add("hidden");
});
document.getElementById("confirm-add-server").addEventListener("click", async () => {
  const name = document.getElementById("new-server-name").value.trim();
  if (!name) return;
  document.getElementById("new-server-name").value = "";
  els.modalAddServer.classList.add("hidden");
  const id = await createServer(name);
  selectServer(id, name);
});

// ---------- Channels ----------
function loadChannels(serverId) {
  if (unsubscribeChannels) unsubscribeChannels();
  const q = query(collection(db, "servers", serverId, "channels"), orderBy("createdAt", "asc"));
  unsubscribeChannels = onSnapshot(q, (snap) => {
    els.channelList.innerHTML = "";
    els.voiceChannelList.innerHTML = "";
    let firstText = null;
    snap.forEach((docSnap) => {
      const ch = docSnap.data();
      if (ch.type === "text") {
        if (!firstText) firstText = { id: docSnap.id, ...ch };
        const item = document.createElement("div");
        item.className = "channel-item";
        item.dataset.channelId = docSnap.id;
        item.textContent = "# " + ch.name;
        if (docSnap.id === currentChannelId) item.classList.add("active");
        item.addEventListener("click", () => selectChannel(docSnap.id, ch.name, "text"));
        els.channelList.appendChild(item);
      } else {
        const item = document.createElement("div");
        item.className = "voice-channel-item";
        item.dataset.channelId = docSnap.id;
        item.textContent = "VOICE: " + ch.name;
        item.addEventListener("click", () => selectChannel(docSnap.id, ch.name, "voice"));
        els.voiceChannelList.appendChild(item);
      }
    });
    // Auto-select first text channel when switching servers
    if (firstText && (!currentChannelId || !snap.docs.find(d => d.id === currentChannelId))) {
      selectChannel(firstText.id, firstText.name, "text");
    }
  });
}

els.btnAddChannel.addEventListener("click", () => {
  if (!currentServerId) return;
  els.modalAddChannel.classList.remove("hidden");
});
document.getElementById("cancel-add-channel").addEventListener("click", () => {
  els.modalAddChannel.classList.add("hidden");
});
document.getElementById("confirm-add-channel").addEventListener("click", async () => {
  const name = document.getElementById("new-channel-name").value.trim();
  const type = document.getElementById("new-channel-type").value;
  if (!name || !currentServerId) return;
  document.getElementById("new-channel-name").value = "";
  els.modalAddChannel.classList.add("hidden");
  await addDoc(collection(db, "servers", currentServerId, "channels"), {
    name,
    type,
    createdAt: Date.now()
  });
});

function selectChannel(channelId, channelName, type) {
  if (currentChannelType === "voice" && currentChannelId !== channelId) {
    leaveVoiceChannel();
  }
  currentChannelId = channelId;
  currentChannelType = type;

  document.querySelectorAll(".channel-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.channelId === channelId);
  });

  if (type === "text") {
    els.activeChannelLabel.textContent = "# " + channelName;
    els.messageInput.placeholder = "Message #" + channelName;
    els.textView.classList.remove("hidden");
    els.voiceView.classList.add("hidden");
    loadMessages(channelId);
  } else {
    els.activeChannelLabel.textContent = "Voice: " + channelName;
    els.textView.classList.add("hidden");
    els.voiceView.classList.remove("hidden");
    joinVoiceChannel(currentServerId, channelId, channelName);
  }
}

// ---------- Messages ----------
function loadMessages(channelId) {
  if (unsubscribeMessages) unsubscribeMessages();
  const q = query(
    collection(db, "servers", currentServerId, "channels", channelId, "messages"),
    orderBy("createdAt", "asc")
  );
  unsubscribeMessages = onSnapshot(q, (snap) => {
    els.messages.innerHTML = "";
    snap.forEach((docSnap) => {
      renderMessage(docSnap.data());
    });
    els.messages.scrollTop = els.messages.scrollHeight;
  });
}

function renderMessage(msg) {
  const div = document.createElement("div");
  div.className = "message";
  const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  div.innerHTML = `
    <div class="message-avatar">${(msg.username || "?")[0].toUpperCase()}</div>
    <div class="message-body">
      <div class="message-header">
        <span class="message-author">${escapeHtml(msg.username || "Unknown")}</span>
        <span class="message-time">${time}</span>
      </div>
      <div class="message-text">${escapeHtml(msg.text)}</div>
    </div>
  `;
  els.messages.appendChild(div);
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

els.messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = els.messageInput.value.trim();
  if (!text || !currentChannelId || !currentServerId) return;
  els.messageInput.value = "";
  await addDoc(
    collection(db, "servers", currentServerId, "channels", currentChannelId, "messages"),
    {
      text,
      username: currentUser.displayName || currentUser.email,
      uid: currentUser.uid,
      createdAt: Date.now()
    }
  );
});

// ---------- Members (simple presence list from users collection) ----------
async function loadMembers() {
  const snap = await getDocs(collection(db, "users"));
  els.membersList.innerHTML = "";
  snap.forEach((docSnap) => {
    const u = docSnap.data();
    const item = document.createElement("div");
    item.className = "member-item";
    item.innerHTML = `<span class="member-dot"></span><span class="member-name">${escapeHtml(u.username || u.email)}</span>`;
    els.membersList.appendChild(item);
  });
}
loadMembers();

// ---------- Voice controls ----------
document.getElementById("btn-toggle-mute").addEventListener("click", (e) => {
  const muted = toggleMute();
  e.target.classList.toggle("active-toggle", muted);
  e.target.textContent = muted ? "Unmute" : "Mute";
});
document.getElementById("btn-toggle-video").addEventListener("click", (e) => {
  const videoOn = toggleVideo();
  e.target.classList.toggle("active-toggle", videoOn);
});
document.getElementById("btn-leave-voice").addEventListener("click", () => {
  leaveVoiceChannel();
  document.getElementById("voice-status-text").textContent = "Not connected";
  document.getElementById("video-grid").innerHTML = "";
  document.getElementById("voice-participants").innerHTML = "";
});
