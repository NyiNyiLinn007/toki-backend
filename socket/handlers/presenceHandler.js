/**
 * Presence Handler
 * Handles user online/offline status events
 */

const { query } = require('../../config/db');

/**
 * Initialize presence handlers for a socket
 * @param {Socket} socket - The connected socket instance
 * @param {Server} io - The Socket.io server instance
 * @param {Map} connectedUsers - Map of connected users
 */
const presenceHandler = (socket, io, connectedUsers) => {

    /**
     * Handle get_online_users event
     * Returns list of currently online users
     */
    socket.on('get_online_users', async (callback) => {
        try {
            const result = await query(
                'SELECT id, username, is_online, last_seen FROM users WHERE is_online = true AND id != $1',
                [socket.userId]
            );

            const onlineUsers = result.rows.map(user => ({
                id: user.id,
                username: user.username,
                isOnline: user.is_online,
                lastSeen: user.last_seen
            }));

            if (callback) {
                callback({ success: true, users: onlineUsers });
            }
        } catch (error) {
            console.error('Get online users error:', error);
            if (callback) callback({ error: 'Failed to fetch online users' });
        }
    });

    /**
     * Handle get_user_status event
     * Returns online status for a specific user
     */
    socket.on('get_user_status', async (data, callback) => {
        const { userId } = data;

        if (!userId) {
            if (callback) callback({ error: 'User ID is required' });
            return;
        }

        try {
            const result = await query(
                'SELECT id, username, is_online, last_seen FROM users WHERE id = $1',
                [userId]
            );

            if (result.rows.length === 0) {
                if (callback) callback({ error: 'User not found' });
                return;
            }

            const user = result.rows[0];
            if (callback) {
                callback({
                    success: true,
                    user: {
                        id: user.id,
                        username: user.username,
                        isOnline: user.is_online,
                        lastSeen: user.last_seen
                    }
                });
            }
        } catch (error) {
            console.error('Get user status error:', error);
            if (callback) callback({ error: 'Failed to fetch user status' });
        }
    });
};

module.exports = presenceHandler;
