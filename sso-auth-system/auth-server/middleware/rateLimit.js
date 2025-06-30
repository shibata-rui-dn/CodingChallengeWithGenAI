import rateLimit from 'express-rate-limit';
import { getConfig } from '../../config/configLoader.js';

const config = getConfig();

const createRateLimiter = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || config.security.rate_limit.window_ms,
    max: options.max || config.security.rate_limit.max_requests,
    message: {
      error: 'too_many_requests',
      error_description: 'Too many requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    ...options
  });
};

const authRateLimit = createRateLimiter({
  max: 5,
  message: {
    error: 'too_many_login_attempts',
    error_description: 'Too many login attempts, please try again later.'
  }
});

const tokenRateLimit = createRateLimiter({
  max: 10,
});

const apiRateLimit = createRateLimiter();

export { 
  createRateLimiter, 
  authRateLimit, 
  tokenRateLimit, 
  apiRateLimit 
};