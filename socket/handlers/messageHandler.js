/**
 * Message Handler
 * Handles all message-related socket events
 */

const { query } = require('../../config/db');

/**
 * Initialize message handlers for a socket
 * @param {Socket} socket - The connected socket instance
 * @param {Server} io - The Socket.io server instance
 * @param {Map} connectedUsers - Map of connected users
 */
const messageHandler = (socket, io, connectedUsers) => {

    /**
     * Handle send_message event
     * Saves message to database and delivers to recipient
     */
    socket.on('send_message', async (data, callback) => {
        const { receiverId, content, tempId } = data;

        // Validate input
        if (!receiverId || !content) {
            const error = { tempId, error: 'Receiver ID and content are required' };
            if (callback) callback(error);
            socket.emit('message_error', error);
            return;
        }

        if (content.trim().length === 0) {
            const error = { tempId, error: 'Message content cannot be empty' };
            if (callback) callback(error);
            socket.emit('message_error', error);
            return;
        }

        if (content.length > 5000) {
            const error = { tempId, error: 'Message too long (max 5000 characters)' };
            if (callback) callback(error);
            socket.emit('message_error', error);
            return;
        }

        try {
            // Verify receiver exists
            const receiverCheck = await query(
                'SELECT id, username FROM users WHERE id = $1',
                [receiverId]
            );

            if (receiverCheck.rows.length === 0) {
                const error = { tempId, error: 'Recipient not found' };
                if (callback) callback(error);
                socket.emit('message_error', error);
                return;
            }

            // Save message to database
            const result = await query(
                `INSERT INTO messages (sender_id, receiver_id, content)
                 VALUES ($1, $2, $3)
                 RETURNING id, sender_id, receiver_id, content, created_at, is_read, read_at`,
                [socket.userId, receiverId, content.trim()]
            );

            const message = {
                id: result.rows[0].id,
                senderId: result.rows[0].sender_id,
                receiverId: result.rows[0].receiver_id,
                content: result.rows[0].content,
                createdAt: result.rows[0].created_at,
                isRead: result.rows[0].is_read,
                readAt: result.rows[0].read_at,
                senderUsername: socket.user.username
            };

            console.log(`📨 Message from ${socket.user.username} to ${receiverCheck.rows[0].username}`);

            // Confirm message sent to sender
            const sentConfirmation = { tempId, message };
            if (callback) callback({ success: true, ...sentConfirmation });
            socket.emit('message_sent', sentConfirmation);

            // Deliver to recipient if online
            const recipientSocketId = connectedUsers.get(String(receiverId));
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('receive_message', { message });
                console.log(`   ↳ Delivered to online user: ${receiverCheck.rows[0].username}`);
            } else {
                console.log(`   ↳ Recipient offline, message stored for later`);
            }

        } catch (error) {
            console.error('Send message error:', error);
            const errorResponse = { tempId, error: 'Failed to send message' };
            if (callback) callback(errorResponse);
            socket.emit('message_error', errorResponse);
        }
    });

    /**
     * Handle mark_read event
     * Marks messages as read and notifies sender
     */
    socket.on('mark_read', async (data) => {
        const { messageIds, senderId } = data;

        if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
            return;
        }

        try {
            const readAt = new Date();

            // Update messages in database
            await query(
                `UPDATE messages 
                 SET is_read = true, read_at = $1 
                 WHERE id = ANY($2) AND receiver_id = $3 AND is_read = false`,
                [readAt, messageIds, socket.userId]
            );

            console.log(`✓ ${socket.user.username} marked ${messageIds.length} messages as read`);

            // Notify sender about read receipts
            if (senderId) {
                const senderSocketId = connectedUsers.get(senderId);
                if (senderSocketId) {
                    io.to(senderSocketId).emit('messages_read', {
                        messageIds,
                        readAt: readAt.toISOString(),
                        readBy: socket.userId
                    });
                }
            }

        } catch (error) {
            console.error('Mark read error:', error);
        }
    });

    /**
     * Handle get_history event
     * Fetches message history between two users
     */
    socket.on('get_history', async (data, callback) => {
        const { partnerId, limit = 50, before } = data;

        if (!partnerId) {
            if (callback) callback({ error: 'Partner ID is required' });
            return;
        }

        try {
            let queryText = `
                SELECT m.id, m.sender_id, m.receiver_id, m.content, m.created_at, m.is_read, m.read_at,
                       u.username as sender_username
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE ((m.sender_id = $1 AND m.receiver_id = $2) 
                    OR (m.sender_id = $2 AND m.receiver_id = $1))
            `;

            const params = [socket.userId, partnerId];

            if (before) {
                queryText += ` AND m.created_at < $3`;
                params.push(before);
            }

            queryText += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
            params.push(limit);

            const result = await query(queryText, params);

            const messages = result.rows.map(row => ({
                id: row.id,
                senderId: row.sender_id,
                receiverId: row.receiver_id,
                content: row.content,
                createdAt: row.created_at,
                isRead: row.is_read,
                readAt: row.read_at,
                senderUsername: row.sender_username
            })).reverse(); // Reverse to get chronological order

            const hasMore = result.rows.length === limit;
            const nextCursor = hasMore ? result.rows[result.rows.length - 1]?.created_at : null;

            if (callback) {
                callback({
                    success: true,
                    messages,
                    hasMore,
                    nextCursor
                });
            }

        } catch (error) {
            console.error('Get history error:', error);
            if (callback) callback({ error: 'Failed to fetch message history' });
        }
    });


    /**
     * Handle edit_message event
     */
    socket.on('edit_message', async (data) => {
        const { messageId, content, receiverId } = data;

        try {
            // Update in DB (we reuse the logic or just do a quick update here)
            // Ideally we call the same logic as the REST API, but for speed let's just update
            const result = await query(
                `UPDATE messages 
                 SET content = $1, is_edited = true, edited_at = NOW() 
                 WHERE id = $2 AND sender_id = $3
                 RETURNING id, content, is_edited, edited_at`,
                [content, messageId, socket.userId]
            );

            if (result.rows.length > 0) {
                const updatedMessage = result.rows[0];

                // Broadcast to receiver
                const recipientSocketId = connectedUsers.get(String(receiverId));
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('message_updated', {
                        id: messageId,
                        content: content,
                        isEdited: true,
                        senderId: socket.userId
                    });
                }

                // Confirm to sender (so they see the update immediately if they have multiple tabs open)
                socket.emit('message_updated', {
                    id: messageId,
                    content: content,
                    isEdited: true,
                    senderId: socket.userId
                });
            }
        } catch (error) {
            console.error('Edit message error:', error);
        }
    });
};

module.exports = messageHandler;
