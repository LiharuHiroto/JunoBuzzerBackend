import express from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

const server = http.createServer(app);

const allowedOrigins = ["http://localhost:5173", "http://localhost:5174"];

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

interface Player {
  id: string;
  name: string;
}
interface Room {
  players: Player[];
  firstBuzz: string | null;
  gameStarted: boolean;
}
interface Rooms {
  [roomCode: string]: Room;
}

const rooms: Rooms = {};

function generateRoomCode(length = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on("connection", (socket: Socket) => {
  socket.on("create_room", () => {
    let roomCode: string;
    do {
      roomCode = generateRoomCode();
    } while (rooms[roomCode]);

    rooms[roomCode] = { players: [], firstBuzz: null, gameStarted: false };
    socket.join(roomCode);
    io.to(socket.id).emit("room_created", { roomCode });
  });

  socket.on(
    "join_room",
    ({ roomCode, playerName }: { roomCode: string; playerName: string }) => {
      const room = rooms[roomCode];
      if (!room) {
        io.to(socket.id).emit("error", "Room does not exist");
        return;
      }

      room.players.push({ id: socket.id, name: playerName });
      socket.join(roomCode);
      const playerList = room.players.map((p) => p.name);
      io.to(roomCode).emit("lobby_update", { players: playerList });
    },
  );

  socket.on("start_game", ({ roomCode }: { roomCode: string }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.gameStarted = true;
    room.firstBuzz = null;
    io.to(roomCode).emit("game_started");
  });

  socket.on(
    "buzz",
    ({ roomCode, playerName }: { roomCode: string; playerName: string }) => {
      const room = rooms[roomCode];
      if (!room || !room.gameStarted) return;

      if (!room.firstBuzz) {
        room.firstBuzz = playerName;
        io.to(roomCode).emit("first_buzz", { player: playerName });
      }
    },
  );

  socket.on("next_round", ({ roomCode }: { roomCode: string }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.firstBuzz = null;
    io.to(roomCode).emit("round_reset");
  });

  socket.on("disconnect", () => {
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      if (!room) continue;

      const disconnectedPlayer = room.players.find((p) => p.id === socket.id);
      room.players = room.players.filter((p) => p.id !== socket.id);

      const playerList = room.players.map((p) => p.name);
      io.to(roomCode).emit("lobby_update", { players: playerList });
    }
  });
});

app.get("/", (req, res) => {
  res.status(201).send("Hello from backend");
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
