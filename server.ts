import express from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
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
  console.log(`[CONNECT] Socket connected: ${socket.id}`);

  socket.on("create_room", () => {
    let roomCode: string;
    do {
      roomCode = generateRoomCode();
    } while (rooms[roomCode]);

    rooms[roomCode] = { players: [], firstBuzz: null, gameStarted: false };
    socket.join(roomCode);
    io.to(socket.id).emit("room_created", { roomCode });
    console.log(
      `[ROOM_CREATED] Room ${roomCode} created by admin ${socket.id}`,
    );
  });

  socket.on(
    "join_room",
    ({ roomCode, playerName }: { roomCode: string; playerName: string }) => {
      console.log(
        `[JOIN_ROOM] Player ${playerName} (${socket.id}) joining room ${roomCode}`,
      );
      const room = rooms[roomCode];
      if (!room) {
        io.to(socket.id).emit("error", "Room does not exist");
        console.log(
          `[ERROR] Player ${playerName} tried to join non-existent room ${roomCode}`,
        );
        return;
      }

      room.players.push({ id: socket.id, name: playerName });
      socket.join(roomCode);
      const playerList = room.players.map((p) => p.name);
      io.to(roomCode).emit("lobby_update", { players: playerList });
      console.log(
        `[LOBBY_UPDATE] Room ${roomCode} players: ${playerList.join(", ")}`,
      );
    },
  );

  socket.on("start_game", ({ roomCode }: { roomCode: string }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.gameStarted = true;
    room.firstBuzz = null;
    io.to(roomCode).emit("game_started");
    console.log(`[GAME_STARTED] Game started in room ${roomCode}`);
  });

  socket.on(
    "buzz",
    ({ roomCode, playerName }: { roomCode: string; playerName: string }) => {
      const room = rooms[roomCode];
      if (!room || !room.gameStarted) return;

      if (!room.firstBuzz) {
        room.firstBuzz = playerName;
        io.to(roomCode).emit("first_buzz", { player: playerName });
        console.log(
          `[FIRST_BUZZ] Player ${playerName} buzzed first in room ${roomCode}`,
        );
      }
    },
  );

  socket.on("next_round", ({ roomCode }: { roomCode: string }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.firstBuzz = null;
    io.to(roomCode).emit("round_reset");
    console.log(`Next round started in room ${roomCode}`);
  });

  socket.on("disconnect", () => {
    console.log(`[DISCONNECT] Socket disconnected: ${socket.id}`);
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      if (!room) continue;

      const disconnectedPlayer = room.players.find((p) => p.id === socket.id);
      room.players = room.players.filter((p) => p.id !== socket.id);

      if (disconnectedPlayer) {
        console.log(
          `[PLAYER_LEFT] Player ${disconnectedPlayer.name} left room ${roomCode}`,
        );
      }

      const playerList = room.players.map((p) => p.name);
      io.to(roomCode).emit("lobby_update", { players: playerList });
      console.log(
        `[LOBBY_UPDATE] Room ${roomCode} after disconnect: ${playerList.join(", ")}`,
      );
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
