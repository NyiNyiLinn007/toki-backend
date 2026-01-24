/**
 * Socket.io Server Configuration
 * Main entry point for socket setup and connection handling
 */

const { query } = require('../config/db');
const socketAuthMiddleware = require('./middleware/socketAuth');
const messageHandler = require('./handlers/messageHandler');
const typingHandler = require('./handlers/typingHandler');
const presenceHandler = require('./handlers/presenceHandler');

// Store connected users: Map<odId, odId>
const connectedUsers = new Map();

/**
 * Initialize Socket.io server with all handlers
 * @param {Server} io - Socket.io server instance
 */
const initializeSocket = (io) => {

    // Apply authentication middleware
    io.use(socketAuthMiddleware);

    // Connection handler
    io.on('connection', async (socket) => {
        const { user, userId } = socket;

        console.log(`\n🔌 User connected: ${user.username} (${userId})`);
        console.log(`   Socket ID: ${socket.id}`);
        console.log(`   Connected users: ${connectedUsers.size + 1}`);

        // Store user's socket ID
        connectedUsers.set(userId, socket.id);

        // Broadcast user online status to all other users
        socket.broadcast.emit('user_online', {
            userId: userId,
            username: user.username
        });

        // Initialize event handlers
        messageHandler(socket, io, connectedUsers);
        typingHandler(socket, io, connectedUsers);
        presenceHandler(socket, io, connectedUsers);

        // Send connection confirmation to client
        socket.emit('connected', {
            userId: userId,
            username: user.username,
            connectedAt: new Date().toISOString()
        });

        // Handle ping for connection health check
        socket.on('ping', (callback) => {
            if (callback) callback({ pong: true, timestamp: Date.now() });
        });

        // Handle disconnect
        socket.on('disconnect', async (reason) => {
            console.log(`\n🔌 User disconnected: ${user.username} (${userId})`);
            console.log(`   Reason: ${reason}`);
            console.log(`   Connected users: ${connectedUsers.size - 1}`);

            // Remove from connected users
            connectedUsers.delete(userId);

            // Update database - set user offline
            try {
                await query(
                    'UPDATE users SET is_online = false, last_seen = NOW() WHERE id = $1',
                    [userId]
                );
            } catch (error) {
                console.error('Error updating user offline status:', error);
            }

            // Broadcast user offline status
            socket.broadcast.emit('user_offline', {
                userId: userId,
                username: user.username,
                lastSeen: new Date().toISOString()
            });
        });

        // Handle connection errors
        socket.on('error', (error) => {
            console.error(`Socket error for ${user.username}:`, error);
        });
    });

    // Handle connection errors (before auth)
    io.on('connect_error', (error) => {
        console.error('Socket connection error:', error.message);
    });

    console.log('✅ Socket.io initialized with authentication');

    return { connectedUsers };
};

/**
 * Get connected users map (for external use)
 */
const getConnectedUsers = () => connectedUsers;

/**
 * Check if a user is online
 * @param {string} userId - User ID to check
 * @returns {boolean}
 */
const isUserOnline = (userId) => connectedUsers.has(userId);

/**
 * Get socket ID for a user
 * @param {string} userId - User ID
 * @returns {string|undefined}
 */
const getUserSocketId = (userId) => connectedUsers.get(userId);

module.exports = {
    initializeSocket,
    getConnectedUsers,
    isUserOnline,
    getUserSocketId
};
