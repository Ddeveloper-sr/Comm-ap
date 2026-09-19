// WebRTC signaling server.
// This does NOT carry voice/video data itself — it only helps peers find each other
// and exchange connection info (offers/answers/ICE candidates). Actual audio/video
// flows directly between users (or via STUN/TURN) once connected.
//
// This must run on a real Node host (Render, Railway, Fly.io, etc.) — NOT GitHub Pages.

const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Signaling server is running.");
});

const io = new Server(server, {
  cors: {
    origin: "*", // For production, replace "*" with your GitHub Pages URL
    methods: ["GET", "POST"]
  }
});

// roomId -> Set of socket ids in that room
const rooms = {};

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("join-room", ({ roomId, username }) => {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.username = username;

    if (!rooms[roomId]) rooms[roomId] = new Set();

    // Notify existing members that a new user joined, so they initiate the offer
    rooms[roomId].forEach((existingId) => {
      io.to(existingId).emit("user-joined", { peerId: socket.id, username });
    });

    rooms[roomId].add(socket.id);
  });

  socket.on("offer", ({ target, offer, roomId }) => {
    io.to(target).emit("offer", { from: socket.id, offer, username: socket.data.username });
  });

  socket.on("answer", ({ target, answer }) => {
    io.to(target).emit("answer", { from: socket.id, answer });
  });

  socket.on("ice-candidate", ({ target, candidate }) => {
    io.to(target).emit("ice-candidate", { from: socket.id, candidate });
  });

  socket.on("leave-room", ({ roomId }) => {
    leaveCurrentRoom(socket);
  });

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket);
    console.log("Client disconnected:", socket.id);
  });
});

function leaveCurrentRoom(socket) {
  const roomId = socket.data.roomId;
  if (roomId && rooms[roomId]) {
    rooms[roomId].delete(socket.id);
    socket.to(roomId).emit("user-left", { peerId: socket.id });
    socket.leave(roomId);
    if (rooms[roomId].size === 0) delete rooms[roomId];
  }
}

server.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);
});
