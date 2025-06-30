import express from 'express';
import authController from '../controllers/authController.js';
import { authRateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

router.get('/login', authController.showLogin);
router.post('/login', authRateLimit, authController.handleLogin);
router.post('/logout', authController.logout);

export default router;