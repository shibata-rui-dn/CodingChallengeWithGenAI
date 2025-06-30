import express from 'express';
import tokenController from '../controllers/tokenController.js';
import { tokenRateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/', tokenRateLimit, tokenController.handleTokenRequest);

export default router;