import express from 'express';
import originController from '../controllers/originController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js'; 
import { apiRateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireAdmin); 
router.use(apiRateLimit);

router.get('/', originController.listOrigins);
router.post('/', originController.addOrigin);
router.delete('/:id', originController.removeOrigin);
router.patch('/:id', originController.toggleOrigin);
router.post('/refresh', originController.refreshCors);

router.get('/stats', originController.getOriginStats);
router.post('/:id/convert-to-manual', originController.convertToManual);

export default router;