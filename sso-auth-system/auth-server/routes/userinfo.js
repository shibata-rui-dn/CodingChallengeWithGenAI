import express from 'express';
import { verifyTokenOnly } from '../middleware/auth.js';
import pool from '../../config/database.js';

const router = express.Router();

// UserInfo endpoint - OAuth 2.0/OpenID Connect standard
router.get('/', verifyTokenOnly, async (req, res) => {
  try {
    const userId = req.user.sub;
    const tokenScope = req.user.scope || '';
    const requestedScopes = tokenScope.split(' ');

    // ユーザー情報を取得（組織情報含む）
    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'user_not_found',
        error_description: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // 基本的なユーザー情報
    const userInfo = {
      sub: user.id.toString(),
      preferred_username: user.username
    };

    // Email scope
    if (requestedScopes.includes('email')) {
      userInfo.email = user.email;
      userInfo.email_verified = true;
    }

    // Profile scope
    if (requestedScopes.includes('profile')) {
      userInfo.name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      userInfo.given_name = user.first_name || '';
      userInfo.family_name = user.last_name || '';
      userInfo.updated_at = user.updated_at;
    }

    // 🆕 Organization scope - 組織情報
    if (requestedScopes.includes('organization')) {
      userInfo.department = user.department || '-';
      userInfo.team = user.team || '-';
      userInfo.supervisor = user.supervisor || '-';
      userInfo.organization = {
        department: user.department || '-',
        team: user.team || '-',
        supervisor: user.supervisor || '-'
      };
    }

    // 🆕 Admin scope - 管理者情報
    if (requestedScopes.includes('admin') && user.role === 'admin') {
      userInfo.role = user.role;
    }

    res.json(userInfo);

  } catch (error) {
    console.error('UserInfo error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error'
    });
  }
});

export default router;