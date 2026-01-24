const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const authMiddleware = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

/**
 * @route   GET /api/users
 * @desc    Get all users (for contacts list)
 * @access  Private
 */
router.get('/', async (req, res) => {
    try {
        const result = await query(
            `SELECT id, username, email, is_online, last_seen, created_at, avatar_url 
             FROM users 
             WHERE id != $1 
             ORDER BY username ASC`,
            [req.user.id]
        );

        res.json({
            success: true,
            users: result.rows.map(user => ({
                id: user.id,
                username: user.username,
                email: user.email,
                isOnline: user.is_online,
                lastSeen: user.last_seen,
                createdAt: user.created_at,
                avatarUrl: user.avatar_url
            }))
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users'
        });
    }
});

/**
 * @route   GET /api/users/search
 * @desc    Search users by username or email
 * @access  Private
 */
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 2 characters'
            });
        }

        const searchTerm = `%${q.trim().toLowerCase()}%`;

        const result = await query(
            `SELECT id, username, email, is_online, last_seen, avatar_url 
             FROM users 
             WHERE id != $1 
               AND (LOWER(username) LIKE $2 OR LOWER(email) LIKE $2)
             ORDER BY 
               CASE WHEN LOWER(username) LIKE $3 THEN 0 ELSE 1 END,
               username ASC
             LIMIT 20`,
            [req.user.id, searchTerm, `${q.trim().toLowerCase()}%`]
        );

        res.json({
            success: true,
            users: result.rows.map(user => ({
                id: user.id,
                username: user.username,
                email: user.email,
                isOnline: user.is_online,
                lastSeen: user.last_seen,
                avatarUrl: user.avatar_url
            }))
        });
    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search users'
        });
    }
});

/**
 * @route   GET /api/users/:id
 * @desc    Get specific user by ID
 * @access  Private
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            `SELECT id, username, email, is_online, last_seen, created_at, avatar_url 
             FROM users 
             WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = result.rows[0];

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                isOnline: user.is_online,
                lastSeen: user.last_seen,
                createdAt: user.created_at,
                avatarUrl: user.avatar_url
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user'
        });
    }
});

/**
 * @route   PUT /api/users/fcm-token
 * @desc    Update user's FCM token
 * @access  Private
 */
router.put('/fcm-token', async (req, res) => {
    try {
        const { token } = req.body;
        const userId = req.user.id;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Token is required'
            });
        }

        await query(
            'UPDATE users SET fcm_token = $1 WHERE id = $2',
            [token, userId]
        );

        res.json({
            success: true,
            message: 'FCM token updated'
        });
    } catch (error) {
        console.error('Update FCM token error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update FCM token'
        });
    }
});

module.exports = router;
