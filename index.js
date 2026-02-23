const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://juno-admin-dashboard.vercel.app",
  "https://juno-buzzer.vercel.app",
];

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const rooms = {};

function generateRoomCode(length = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on("connection", (socket) => {
  socket.on("create_room", () => {
    let roomCode;
    do {
      roomCode = generateRoomCode();
    } while (rooms[roomCode]);

    rooms[roomCode] = { players: [], buzzOrder: [], gameStarted: false };
    socket.join(roomCode);
    io.to(socket.id).emit("room_created", { roomCode });
  });

  socket.on("join_room", ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (!room) {
      io.to(socket.id).emit("error", "Room does not exist");
      return;
    }

    room.players.push({ id: socket.id, name: playerName });
    socket.join(roomCode);
    io.to(roomCode).emit("lobby_update", {
      players: room.players.map((p) => p.name),
    });
  });

  socket.on("start_game", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.gameStarted = true;
    room.buzzOrder = [];
    io.to(roomCode).emit("game_started");
  });

  socket.on("buzz", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || !room.gameStarted) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    const alreadyBuzzed = room.buzzOrder.find((p) => p.id === socket.id);
    if (alreadyBuzzed) return;

    room.buzzOrder.push({
      id: socket.id,
      name: player.name,
    });

    io.to(roomCode).emit("buzz_update", {
      buzzOrder: room.buzzOrder,
    });
  });

  socket.on("next_round", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.buzzOrder = [];
    io.to(roomCode).emit("round_reset");
  });

  socket.on("disconnect", () => {
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      if (!room) continue;

      room.players = room.players.filter((p) => p.id !== socket.id);
      room.buzzOrder = room.buzzOrder.filter((p) => p.id !== socket.id);

      io.to(roomCode).emit("lobby_update", {
        players: room.players.map((p) => p.name),
      });

      io.to(roomCode).emit("buzz_update", {
        buzzOrder: room.buzzOrder,
      });
    }
  });
});

app.delete("/rooms/:code", (req, res) => {
  const { code } = req.params;

  if (!rooms[code]) {
    return res.status(404).json({ message: "Room not found" });
  }

  delete rooms[code];

  res.json({ message: "Room deleted" });
});

app.get("/rooms", (_req, res) => {
  const roomList = Object.keys(rooms).map((code) => ({
    code,
    playerCount: rooms[code].players.length,
    gameStarted: rooms[code].gameStarted,
  }));

  res.json(roomList);
});

app.get("/", (req, res) => {
  res.status(200).send("Hello from backend");
});

server.listen(5000, () => console.log("Server running on port 5000"));
