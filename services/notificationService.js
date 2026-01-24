const admin = require('../config/firebase');
const { query } = require('../config/db');

/**
 * Send push notification to a user
 * @param {string} userId - Target user ID
 * @param {object} notification - { title, body, data }
 */
const sendNotification = async (userId, notification) => {
    try {
        // Get user's FCM token
        const result = await query(
            'SELECT fcm_token FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0 || !result.rows[0].fcm_token) {
            return false; // No token
        }

        const token = result.rows[0].fcm_token;

        const message = {
            notification: {
                title: notification.title,
                body: notification.body,
            },
            data: {
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                ...notification.data,
            },
            token: token,
            android: {
                priority: 'high',
                notification: {
                    channelId: 'messages',
                }
            },
            apns: {
                payload: {
                    aps: {
                        contentAvailable: true,
                    },
                },
            },
        };

        await admin.messaging().send(message);
        return true;

    } catch (error) {
        console.error('Error sending notification:', error);
        // If token invalid, could remove it from DB
        if (error.code === 'messaging/registration-token-not-registered') {
            await query(
                'UPDATE users SET fcm_token = NULL WHERE id = $1',
                [userId]
            );
        }
        return false;
    }
};

module.exports = { sendNotification };
