/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);

    // Default error
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';

    // Mongoose/PostgreSQL duplicate key error
    if (err.code === '23505') {
        statusCode = 409;
        message = 'Duplicate entry. Resource already exists.';
    }

    // Mongoose/PostgreSQL foreign key violation
    if (err.code === '23503') {
        statusCode = 400;
        message = 'Referenced resource does not exist.';
    }

    // JWT errors are handled in middleware, but just in case
    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid token';
    }

    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Token expired';
    }

    // Validation errors
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = err.message;
    }

    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;
