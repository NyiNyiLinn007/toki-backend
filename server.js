/**
 * Toki Messaging App - Main Server Entry Point
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');

// Import configurations
const { testConnection } = require('./config/db');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');

// Import socket setup
const { initializeSocket } = require('./socket');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// CORS Origins Configuration - supports multiple origins
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://toki-message.vercel.app', // Production Vercel frontend
    process.env.CORS_ORIGIN, // Additional origin from env
].filter(Boolean); // Remove undefined values

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin) || process.env.CORS_ORIGIN === '*') {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(null, true); // In production, allow all for now (adjust as needed)
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

// Initialize Socket.io with CORS
const io = new Server(server, {
    cors: corsOptions,
    pingTimeout: 60000,
    pingInterval: 25000
});

// =============================================
// MIDDLEWARE
// =============================================

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Request logging (development only)
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
        next();
    });
}

// =============================================
// ROUTES
// =============================================

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/conversations', messageRoutes); // Alias for conversations

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.path} not found`
    });
});

// Error handler (must be last)
app.use(errorHandler);

// =============================================
// SOCKET.IO INITIALIZATION
// =============================================

initializeSocket(io);

// =============================================
// START SERVER
// =============================================

const PORT = process.env.PORT || 4500;

const startServer = async () => {
    // Test database connection
    const dbConnected = await testConnection();

    if (!dbConnected) {
        console.error('❌ Failed to connect to database. Exiting...');
        process.exit(1);
    }

    server.listen(PORT, () => {
        console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🚀 Toki Messaging Server                               ║
║                                                          ║
║   REST API:    http://localhost:${PORT}                    ║
║   Socket.io:   ws://localhost:${PORT}                      ║
║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(26)}║
║                                                          ║
╠══════════════════════════════════════════════════════════╣
║   Auth:     POST /api/auth/register, login, logout      ║
║   Users:    GET  /api/users, /api/users/search?q=       ║
║   Messages: GET  /api/messages/:partnerId                ║
║   Convos:   GET  /api/conversations                      ║
║   Health:   GET  /health                                 ║
╠══════════════════════════════════════════════════════════╣
║   Socket Events:                                         ║
║   • send_message    → receive_message                    ║
║   • typing / stop_typing                                 ║
║   • mark_read       → messages_read                      ║
║   • get_history     (with callback)                      ║
╚══════════════════════════════════════════════════════════╝
        `);
    });
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
    server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
});

startServer();
