/**
 * Typing Handler
 * Handles typing indicator events
 */

/**
 * Initialize typing handlers for a socket
 * @param {Socket} socket - The connected socket instance
 * @param {Server} io - The Socket.io server instance
 * @param {Map} connectedUsers - Map of connected users
 */
const typingHandler = (socket, io, connectedUsers) => {

    /**
     * Handle typing event - user started typing
     */
    socket.on('typing', (data) => {
        const { receiverId } = data;

        if (!receiverId) return;

        // Send typing indicator to recipient if online
        const recipientSocketId = connectedUsers.get(receiverId);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('user_typing', {
                userId: socket.userId,
                username: socket.user.username
            });
        }
    });

    /**
     * Handle stop_typing event - user stopped typing
     */
    socket.on('stop_typing', (data) => {
        const { receiverId } = data;

        if (!receiverId) return;

        // Send stop typing indicator to recipient if online
        const recipientSocketId = connectedUsers.get(receiverId);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('user_stop_typing', {
                userId: socket.userId,
                username: socket.user.username
            });
        }
    });
};

module.exports = typingHandler;
