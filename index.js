"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var http_1 = require("http");
var socket_io_1 = require("socket.io");
var cors_1 = require("cors");
var app = (0, express_1.default)();
app.use((0, cors_1.default)());
var server = http_1.default.createServer(app);
var allowedOrigins = ["http://localhost:5173", "http://localhost:5174"];
var io = new socket_io_1.Server(server, {
    cors: {
        origin: function (origin, callback) {
            if (!origin)
                return callback(null, true);
            if (allowedOrigins.includes(origin))
                callback(null, true);
            else
                callback(new Error("Not allowed by CORS"));
        },
        methods: ["GET", "POST"],
        credentials: true,
    },
});
var rooms = {};
function generateRoomCode(length) {
    if (length === void 0) { length = 6; }
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    var code = "";
    for (var i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
io.on("connection", function (socket) {
    socket.on("create_room", function () {
        var roomCode;
        do {
            roomCode = generateRoomCode();
        } while (rooms[roomCode]);
        rooms[roomCode] = { players: [], firstBuzz: null, gameStarted: false };
        socket.join(roomCode);
        io.to(socket.id).emit("room_created", { roomCode: roomCode });
    });
    socket.on("join_room", function (_a) {
        var roomCode = _a.roomCode, playerName = _a.playerName;
        var room = rooms[roomCode];
        if (!room) {
            io.to(socket.id).emit("error", "Room does not exist");
            return;
        }
        room.players.push({ id: socket.id, name: playerName });
        socket.join(roomCode);
        var playerList = room.players.map(function (p) { return p.name; });
        io.to(roomCode).emit("lobby_update", { players: playerList });
    });
    socket.on("start_game", function (_a) {
        var roomCode = _a.roomCode;
        var room = rooms[roomCode];
        if (!room)
            return;
        room.gameStarted = true;
        room.firstBuzz = null;
        io.to(roomCode).emit("game_started");
    });
    socket.on("buzz", function (_a) {
        var roomCode = _a.roomCode, playerName = _a.playerName;
        var room = rooms[roomCode];
        if (!room || !room.gameStarted)
            return;
        if (!room.firstBuzz) {
            room.firstBuzz = playerName;
            io.to(roomCode).emit("first_buzz", { player: playerName });
        }
    });
    socket.on("next_round", function (_a) {
        var roomCode = _a.roomCode;
        var room = rooms[roomCode];
        if (!room)
            return;
        room.firstBuzz = null;
        io.to(roomCode).emit("round_reset");
    });
    socket.on("disconnect", function () {
        for (var roomCode in rooms) {
            var room = rooms[roomCode];
            if (!room)
                continue;
            var disconnectedPlayer = room.players.find(function (p) { return p.id === socket.id; });
            room.players = room.players.filter(function (p) { return p.id !== socket.id; });
            var playerList = room.players.map(function (p) { return p.name; });
            io.to(roomCode).emit("lobby_update", { players: playerList });
        }
    });
});
app.get("/", function (req, res) {
    res.status(201).send("Hello from backend");
});
var PORT = process.env.PORT || 5000;
server.listen(PORT, function () { return console.log("Server running on port ".concat(PORT)); });
