const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(__dirname));
app.use(express.static('public')); // This tells Node.js to look inside the public folder too!
app.use(express.static(__dirname));

// Store active sessions by unique username
// Format: { username: { socketId, password, country, tier } }
const sessions = {};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Host creates a session with a unique username and password
    socket.on('create-session', ({ username, password, country, tier }) => {
        if (sessions[username]) {
            socket.emit('join-error', { message: '❌ This username is already taken. Choose another.' });
            return;
        }

        sessions[username] = {
            socketId: socket.id,
            password: password,
            country: country,
            tier: tier
        };

        socket.emit('host-success', { username, tier });
        console.log(`Hotspot Hosted -> User: ${username} | Country: ${country} | Tier: ${tier}`);
    });

    // Receiver connects using the Host's unique username and password
    socket.on('join-session', ({ hostUsername, password, receiverName }) => {
        const session = sessions[hostUsername];

        if (!session) {
            socket.emit('join-error', { message: '❌ Host username not found.' });
            return;
        }

        if (session.password !== password) {
            socket.emit('join-error', { message: '❌ Incorrect session password.' });
            return;
        }

        // Notify receiver success
        socket.emit('joined-success', { hostUsername, tier: session.tier });

        // Alert the host that a receiver has connected
        io.to(session.socketId).emit('peer-joined', { receiverId: socket.id, receiverName });
        console.log(`Receiver ${receiverName} (${socket.id}) connected to host ${hostUsername}`);
    });

    // WebRTC Signaling relays
    socket.on('offer', ({ targetId, offer }) => {
        io.to(targetId).emit('offer', { senderId: socket.id, offer });
    });

    socket.on('answer', ({ targetId, answer }) => {
        io.to(targetId).emit('answer', { targetId: socket.id, answer });
    });

    socket.on('ice-candidate', ({ targetId, candidate }) => {
        io.to(targetId).emit('ice-candidate', { candidate });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        for (const user in sessions) {
            if (sessions[user].socketId === socket.id) {
                delete sessions[user];
                console.log(`Session closed for host: ${user}`);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`P2P NetShare Server running on http://localhost:${PORT}`);
});