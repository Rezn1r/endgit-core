import rateLimit from "express-rate-limit";

// Generic rate limiter for public routes
export const publicRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    error: "Too many requests, please try again later.",
  },
});

// Stricter rate limiter for auth routes
export const authRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 requests per `window`
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many authentication attempts, please try again later.",
  },
});

// Upload rate limiter
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 uploads per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many uploads, please try again later.",
  },
});

// Build trigger rate limiter — prevent worker spam
export const buildRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 build triggers per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many build requests. Max 5 builds per hour.",
  },
});
