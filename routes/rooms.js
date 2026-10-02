const express = require('express');
const jwt = require('jsonwebtoken');
const { run, get, all } = require('../database');

const router = express.Router();
const SECRET = 'duelarena_secret_key_2025';

function auth(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    try {
        req.user = jwt.verify(token, SECRET);
        next();
    } catch (e) {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

function generateRoomCode() {
    return Math.floor(10000 + Math.random() * 90000).toString();
}

// Create room
router.post('/create', auth, (req, res) => {
    try {
        let code;
        let attempts = 0;

        while (attempts < 10) {
            code = generateRoomCode();
            const existing = get(
                'SELECT id FROM rooms WHERE code = ? AND status = "waiting"',
                [code]
            );
            if (!existing) break;
            attempts++;
        }

        run('INSERT INTO rooms (code, player1_id, status) VALUES (?, ?, "waiting")',
            [code, req.user.id]);

        const room = get('SELECT * FROM rooms WHERE code = ?', [code]);

        res.json({
            success: true,
            roomCode: code,
            roomId: room.id,
            message: 'Room created! Share code with friend.'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Join room
router.post('/join', auth, (req, res) => {
    const { roomCode } = req.body;

    if (!roomCode) {
        return res.status(400).json({ error: 'Room code required' });
    }

    try {
        const room = get(
            'SELECT * FROM rooms WHERE code = ? AND status = "waiting"',
            [roomCode]
        );

        if (!room) {
            return res.status(404).json({ error: 'Room not found or already full' });
        }

        if (room.player1_id === req.user.id) {
            return res.status(400).json({ error: 'You cannot join your own room' });
        }

        run('UPDATE rooms SET player2_id = ?, status = "playing" WHERE id = ?',
            [req.user.id, room.id]);

        res.json({
            success: true,
            roomCode: room.code,
            roomId: room.id,
            player1_id: room.player1_id,
            player2_id: req.user.id,
            message: 'Joined room!'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get room info
router.get('/:code', auth, (req, res) => {
    try {
        const room = get(
            `SELECT r.*, 
                    u1.username as player1_name, 
                    u2.username as player2_name
             FROM rooms r
             LEFT JOIN users u1 ON u1.id = r.player1_id
             LEFT JOIN users u2 ON u2.id = r.player2_id
             WHERE r.code = ?`,
            [req.params.code]
        );

        if (!room) return res.status(404).json({ error: 'Room not found' });
        res.json(room);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete room
router.delete('/:code', auth, (req, res) => {
    try {
        run('DELETE FROM rooms WHERE code = ? AND (player1_id = ? OR player2_id = ?)',
            [req.params.code, req.user.id, req.user.id]);
        res.json({ success: true, message: 'Room deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Save game result
router.post('/result', auth, (req, res) => {
    const { roomCode, winnerId, player1Score, player2Score } = req.body;

    try {
        const room = get('SELECT * FROM rooms WHERE code = ?', [roomCode]);
        if (!room) return res.status(404).json({ error: 'Room not found' });

        run(
            `INSERT INTO game_history 
             (room_code, player1_id, player2_id, winner_id, player1_score, player2_score) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [roomCode, room.player1_id, room.player2_id, winnerId, player1Score, player2Score]
        );

        const loserId = winnerId === room.player1_id ? room.player2_id : room.player1_id;
        run('UPDATE users SET wins = wins + 1 WHERE id = ?', [winnerId]);
        run('UPDATE users SET losses = losses + 1 WHERE id = ?', [loserId]);
        run('UPDATE rooms SET status = "finished" WHERE id = ?', [room.id]);

        res.json({ success: true, message: 'Result saved' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
