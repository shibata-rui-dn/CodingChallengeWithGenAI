import pool from '../../config/database.js';

/**
 * Role-Based Access Control (RBAC) Middleware
 */

// ユーザーの役割を取得
async function getUserRole(userId) {
  try {
    const result = await pool.query('SELECT role FROM users WHERE id = ?', [userId]);
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0].role;
  } catch (error) {
    console.error('Error fetching user role:', error);
    return null;
  }
}

// 管理者権限をチェック
const requireAdmin = async (req, res, next) => {
  try {
    const userId = req.user?.sub;
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'unauthorized',
        error_description: 'Authentication required' 
      });
    }

    const userRole = await getUserRole(userId);
    
    if (userRole !== 'admin') {
      return res.status(403).json({ 
        error: 'forbidden',
        error_description: 'Admin privileges required' 
      });
    }

    req.user.role = userRole;
    next();
  } catch (error) {
    console.error('Admin authorization error:', error);
    res.status(500).json({ 
      error: 'server_error',
      error_description: 'Authorization service error' 
    });
  }
};

// 特定の役割をチェック
const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.sub;
      
      if (!userId) {
        return res.status(401).json({ 
          error: 'unauthorized',
          error_description: 'Authentication required' 
        });
      }

      const userRole = await getUserRole(userId);
      
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ 
          error: 'forbidden',
          error_description: `Required role: ${allowedRoles.join(' or ')}` 
        });
      }

      req.user.role = userRole;
      next();
    } catch (error) {
      console.error('Role authorization error:', error);
      res.status(500).json({ 
        error: 'server_error',
        error_description: 'Authorization service error' 
      });
    }
  };
};

// ユーザー自身または管理者のみアクセス可能
const requireSelfOrAdmin = async (req, res, next) => {
  try {
    const userId = req.user?.sub;
    const targetUserId = req.params.id;
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'unauthorized',
        error_description: 'Authentication required' 
      });
    }

    const userRole = await getUserRole(userId);
    
    // 管理者または自分自身の場合はアクセス許可
    if (userRole === 'admin' || userId.toString() === targetUserId.toString()) {
      req.user.role = userRole;
      next();
    } else {
      return res.status(403).json({ 
        error: 'forbidden',
        error_description: 'Access denied: insufficient privileges' 
      });
    }
  } catch (error) {
    console.error('Self or admin authorization error:', error);
    res.status(500).json({ 
      error: 'server_error',
      error_description: 'Authorization service error' 
    });
  }
};

export { 
  requireAdmin, 
  requireRole, 
  requireSelfOrAdmin, 
  getUserRole 
};