const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const authMiddleware = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

/**
 * @route   GET /api/conversations
 * @desc    Get all conversations with last message for current user
 * @access  Private
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;

        // Get all unique conversation partners with their last message
        const result = await query(
            `WITH conversation_partners AS (
                SELECT DISTINCT
                    CASE 
                        WHEN sender_id = $1 THEN receiver_id 
                        ELSE sender_id 
                    END as partner_id
                FROM messages
                WHERE sender_id = $1 OR receiver_id = $1
            ),
            last_messages AS (
                SELECT DISTINCT ON (partner_id)
                    cp.partner_id,
                    m.id as message_id,
                    m.sender_id,
                    m.receiver_id,
                    m.content,
                    m.created_at,
                    m.is_read
                FROM conversation_partners cp
                JOIN messages m ON (
                    (m.sender_id = $1 AND m.receiver_id = cp.partner_id) OR
                    (m.sender_id = cp.partner_id AND m.receiver_id = $1)
                )
                ORDER BY cp.partner_id, m.created_at DESC
            ),
            unread_counts AS (
                SELECT 
                    sender_id as partner_id,
                    COUNT(*) as unread_count
                FROM messages
                WHERE receiver_id = $1 AND is_read = false
                GROUP BY sender_id
            )
            SELECT 
                u.id,
                u.username,
                u.email,
                u.is_online,
                u.last_seen,
                u.avatar_url,
                lm.message_id,
                lm.sender_id as last_message_sender_id,
                lm.content as last_message_content,
                lm.created_at as last_message_at,
                lm.is_read as last_message_is_read,
                COALESCE(uc.unread_count, 0) as unread_count
            FROM last_messages lm
            JOIN users u ON u.id = lm.partner_id
            LEFT JOIN unread_counts uc ON uc.partner_id = lm.partner_id
            ORDER BY lm.created_at DESC`,
            [userId]
        );

        const conversations = result.rows.map(row => ({
            id: row.id,
            username: row.username,
            email: row.email,
            isOnline: row.is_online,
            lastSeen: row.last_seen,
            avatarUrl: row.avatar_url,
            lastMessage: row.message_id ? {
                id: row.message_id,
                senderId: row.last_message_sender_id,
                content: row.last_message_content,
                createdAt: row.last_message_at,
                isRead: row.last_message_is_read,
                isFromMe: row.last_message_sender_id === userId
            } : null,
            unreadCount: parseInt(row.unread_count, 10)
        }));

        res.json({
            success: true,
            conversations
        });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch conversations'
        });
    }
});

/**
 * @route   GET /api/messages/:partnerId
 * @desc    Get message history with a specific user
 * @access  Private
 */
router.get('/:partnerId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { partnerId } = req.params;
        const { limit = 50, before } = req.query;

        // Verify partner exists
        const partnerCheck = await query(
            'SELECT id, username FROM users WHERE id = $1',
            [partnerId]
        );

        if (partnerCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        let queryText = `
            SELECT 
                m.id, 
                m.sender_id, 
                m.receiver_id, 
                m.content, 
                m.created_at, 
                m.is_read, 
                m.read_at,
                u.username as sender_username
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE (
                (m.sender_id = $1 AND m.receiver_id = $2) OR
                (m.sender_id = $2 AND m.receiver_id = $1)
            )
        `;

        const params = [userId, partnerId];

        if (before) {
            queryText += ` AND m.created_at < $3`;
            params.push(before);
        }

        queryText += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit, 10));

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

        const hasMore = result.rows.length === parseInt(limit, 10);
        const nextCursor = hasMore ? result.rows[result.rows.length - 1]?.created_at : null;

        res.json({
            success: true,
            messages,
            hasMore,
            nextCursor,
            partner: {
                id: partnerCheck.rows[0].id,
                username: partnerCheck.rows[0].username
            }
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch messages'
        });
    }
});

/**
 * @route   POST /api/messages/:partnerId
 * @desc    Send a message via REST (fallback for socket issues)
 * @access  Private
 */
router.post('/:partnerId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { partnerId } = req.params;
        const { content } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Message content is required'
            });
        }

        if (content.length > 5000) {
            return res.status(400).json({
                success: false,
                message: 'Message too long (max 5000 characters)'
            });
        }

        // Verify partner exists
        const partnerCheck = await query(
            'SELECT id, username FROM users WHERE id = $1',
            [partnerId]
        );

        if (partnerCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Recipient not found'
            });
        }

        // Insert message
        const result = await query(
            `INSERT INTO messages (sender_id, receiver_id, content)
             VALUES ($1, $2, $3)
             RETURNING id, sender_id, receiver_id, content, created_at, is_read, read_at`,
            [userId, partnerId, content.trim()]
        );

        const message = {
            id: result.rows[0].id,
            senderId: result.rows[0].sender_id,
            receiverId: result.rows[0].receiver_id,
            content: result.rows[0].content,
            createdAt: result.rows[0].created_at,
            isRead: result.rows[0].is_read,
            readAt: result.rows[0].read_at,
            senderUsername: req.user.username
        };

        res.status(201).json({
            success: true,
            message
        });

        // Note: Socket notification should be handled separately if needed
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message'
        });
    }
});

/**
 * @route   PUT /api/messages/read
 * @desc    Mark messages as read
 * @access  Private
 */
router.put('/read', async (req, res) => {
    try {
        const userId = req.user.id;
        const { messageIds } = req.body;

        if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Message IDs array is required'
            });
        }

        const readAt = new Date();

        await query(
            `UPDATE messages 
             SET is_read = true, read_at = $1 
             WHERE id = ANY($2) AND receiver_id = $3 AND is_read = false`,
            [readAt, messageIds, userId]
        );

        res.json({
            success: true,
            readAt: readAt.toISOString()
        });
    } catch (error) {
        console.error('Mark read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark messages as read'
        });
    }
});

/**
 * @route   DELETE /api/messages/message/:messageId
 * @desc    Delete a message (soft delete)
 * @access  Private
 */
router.delete('/message/:messageId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { messageId } = req.params;

        // Verify message belongs to user
        const messageCheck = await query(
            'SELECT id, sender_id, receiver_id FROM messages WHERE id = $1',
            [messageId]
        );

        if (messageCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        const message = messageCheck.rows[0];

        // Only sender can delete their message
        if (message.sender_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete your own messages'
            });
        }

        // Soft delete the message
        await query(
            `UPDATE messages 
             SET is_deleted = true, deleted_at = NOW(), content = '[Message deleted]'
             WHERE id = $1`,
            [messageId]
        );

        res.json({
            success: true,
            message: 'Message deleted'
        });

    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete message'
        });
    }
});

/**
 * @route   PUT /api/messages/message/:messageId
 * @desc    Edit a message
 * @access  Private
 */
router.put('/message/:messageId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { messageId } = req.params;
        const { content } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Message content is required'
            });
        }

        // Verify message belongs to user
        const messageCheck = await query(
            'SELECT id, sender_id, content, is_deleted FROM messages WHERE id = $1',
            [messageId]
        );

        if (messageCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        const message = messageCheck.rows[0];

        if (message.sender_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'You can only edit your own messages'
            });
        }

        if (message.is_deleted) {
            return res.status(400).json({
                success: false,
                message: 'Cannot edit a deleted message'
            });
        }

        // Update message with edit tracking
        const result = await query(
            `UPDATE messages 
             SET content = $1, 
                 is_edited = true, 
                 edited_at = NOW(),
                 original_content = COALESCE(original_content, $2)
             WHERE id = $3
             RETURNING id, sender_id, receiver_id, content, created_at, is_read, is_edited, edited_at`,
            [content.trim(), message.content, messageId]
        );

        res.json({
            success: true,
            message: {
                id: result.rows[0].id,
                senderId: result.rows[0].sender_id,
                receiverId: result.rows[0].receiver_id,
                content: result.rows[0].content,
                createdAt: result.rows[0].created_at,
                isRead: result.rows[0].is_read,
                isEdited: result.rows[0].is_edited,
                editedAt: result.rows[0].edited_at
            }
        });

    } catch (error) {
        console.error('Edit message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to edit message'
        });
    }
});

module.exports = router;
