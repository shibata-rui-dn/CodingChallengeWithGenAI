import express from 'express';
import userController from '../controllers/userController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin, requireSelfOrAdmin } from '../middleware/rbac.js';
import { apiRateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// 全てのルートで認証が必要
router.use(authenticateToken);
router.use(apiRateLimit);

// ユーザー統計情報（管理者のみ）
router.get('/stats', requireAdmin, userController.getUserStats);

// ユーザー一覧取得（管理者のみ）
router.get('/', requireAdmin, userController.listUsers);

// ユーザー作成（管理者のみ）
router.post('/', requireAdmin, userController.createUser);

// ユーザー詳細取得（本人または管理者）
router.get('/:id', requireSelfOrAdmin, userController.getUser);

// ユーザー更新（本人または管理者）
router.patch('/:id', requireSelfOrAdmin, userController.updateUser);

// ユーザー削除（管理者のみ）
router.delete('/:id', requireAdmin, userController.deleteUser);

export default router;