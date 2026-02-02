/**
 * Socket.io JWT Authentication Middleware
 * Authenticates socket connections using JWT token from handshake
 */

const jwt = require('jsonwebtoken');
const { query } = require('../../config/db');

/**
 * Middleware to authenticate socket connections
 * Token should be passed in handshake auth: { token: 'jwt_token' }
 */
const socketAuthMiddleware = async (socket, next) => {
    try {
        // Get token from handshake auth
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;

        if (!token) {
            return next(new Error('Authentication error: No token provided'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Fetch user from database
        const result = await query(
            'SELECT id, username, email, is_online FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return next(new Error('Authentication error: User not found'));
        }

        // Attach user data to socket
        socket.user = result.rows[0];
        socket.userId = String(result.rows[0].id);

        // Update user online status
        await query(
            'UPDATE users SET is_online = true WHERE id = $1',
            [socket.userId]
        );

        console.log(`✅ Socket authenticated: ${socket.user.username} (${socket.userId})`);
        next();

    } catch (error) {
        console.error('Socket auth error:', error.message);

        if (error.name === 'JsonWebTokenError') {
            return next(new Error('Authentication error: Invalid token'));
        }
        if (error.name === 'TokenExpiredError') {
            return next(new Error('Authentication error: Token expired'));
        }

        return next(new Error('Authentication error: ' + error.message));
    }
};

module.exports = socketAuthMiddleware;
