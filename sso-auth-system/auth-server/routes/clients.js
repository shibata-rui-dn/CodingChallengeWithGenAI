import express from 'express';
import clientController from '../controllers/clientController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';
import { apiRateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// 全てのルートで認証と管理者権限が必要
router.use(authenticateToken);
router.use(requireAdmin);
router.use(apiRateLimit);

// クライアント統計情報
router.get('/stats', clientController.getClientStats);

// クライアント一覧取得
router.get('/', clientController.listClients);

// クライアント作成
router.post('/', clientController.createClient);

// クライアント詳細取得
router.get('/:client_id', clientController.getClient);

// クライアント更新
router.patch('/:client_id', clientController.updateClient);

// クライアント削除
router.delete('/:client_id', clientController.deleteClient);

// クライアントシークレット再生成
router.post('/:client_id/regenerate-secret', clientController.regenerateSecret);

export default router;