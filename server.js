const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/admin', require('./routes/admin'));

// Home route
app.get('/', (req, res) => {
    res.json({
        status: 'success',
        message: 'Welcome to Duel Arena API',
        version: '1.0.0'
    });
});

// ============ SOCKET.IO - REAL-TIME GAME ============

const activeRooms = {};

io.on('connection', (socket) => {
    console.log('🔌 Player connected:', socket.id);

    // Create room
    socket.on('create_room', (data) => {
        const { roomCode, username, userId } = data;

        activeRooms[roomCode] = {
            players: [{
                socketId: socket.id,
                userId: userId,
                username: username,
                x: 200,
                y: 800,
                health: 100,
                score: 0
            }],
            gameState: 'waiting',
            bullets: []
        };

        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.userId = userId;

        socket.emit('room_created', { roomCode, message: 'Room created!' });
        console.log(`🎮 Room ${roomCode} created by ${username}`);
    });

    // Join room
    socket.on('join_room', (data) => {
        const { roomCode, username, userId } = data;
        const room = activeRooms[roomCode];

        if (!room) {
            socket.emit('error', { message: 'Room not found!' });
            return;
        }

        if (room.players.length >= 2) {
            socket.emit('error', { message: 'Room is full!' });
            return;
        }

        room.players.push({
            socketId: socket.id,
            userId: userId,
            username: username,
            x: 600,
            y: 800,
            health: 100,
            score: 0
        });

        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.userId = userId;

        room.gameState = 'playing';

        io.to(roomCode).emit('game_start', {
            roomCode: roomCode,
            players: room.players
        });

        console.log(`🎮 ${username} joined room ${roomCode}`);
    });

    // Player movement
    socket.on('player_move', (data) => {
        const room = activeRooms[socket.roomCode];
        if (!room) return;

        const player = room.players.find(p => p.socketId === socket.id);
        if (player) {
            player.x = data.x;
            player.y = data.y;
        }

        socket.to(socket.roomCode).emit('player_moved', {
            socketId: socket.id,
            x: data.x,
            y: data.y
        });
    });

    // Player shoots
    socket.on('player_shoot', (data) => {
        const room = activeRooms[socket.roomCode];
        if (!room) return;

        const bullet = {
            id: Date.now(),
            ownerSocketId: socket.id,
            x: data.x,
            y: data.y,
            dx: data.dx,
            dy: data.dy
        };

        room.bullets.push(bullet);
        io.to(socket.roomCode).emit('bullet_spawned', bullet);
    });

    // Bullet hit
    socket.on('bullet_hit', (data) => {
        const room = activeRooms[socket.roomCode];
        if (!room) return;

        const target = room.players.find(p => p.socketId === data.targetSocketId);
        if (target) {
            target.health -= 10;

            if (target.health <= 0) {
                const killer = room.players.find(p => p.socketId === data.killerSocketId);
                if (killer) killer.score += 1;

                io.to(socket.roomCode).emit('player_died', {
                    playerSocketId: target.socketId,
                    killerSocketId: data.killerSocketId,
                    scores: room.players.map(p => ({
                        username: p.username,
                        score: p.score
                    }))
                });

                target.health = 100;
                target.x = target.socketId === room.players[0].socketId ? 200 : 600;
                target.y = 800;
            }

            io.to(socket.roomCode).emit('player_health', {
                socketId: target.socketId,
                health: target.health
            });
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('🔌 Player disconnected:', socket.id);

        const room = activeRooms[socket.roomCode];
        if (room) {
            room.players = room.players.filter(p => p.socketId !== socket.id);

            if (room.players.length === 0) {
                delete activeRooms[socket.roomCode];
                console.log(`🗑️ Room ${socket.roomCode} deleted`);
            } else {
                io.to(socket.roomCode).emit('opponent_left', {
                    message: 'Opponent left the game'
                });
            }
        }
    });
});

// Initialize database and start server
initDatabase().then(() => {
    console.log('✅ Database ready');
    
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`🌐 http://localhost:${PORT}`);
        console.log(`👤 Admin: http://localhost:${PORT}/admin.html`);
    });
}).catch(err => {
    console.error('❌ Database error:', err);
    process.exit(1);
});
