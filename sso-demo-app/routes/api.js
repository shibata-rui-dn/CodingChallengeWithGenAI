import express from 'express';
import BadgeManager from '../database/badges.js';
import { requireAdmin, requireManager, rateLimit } from '../middleware/auth.js';

const router = express.Router();

// レート制限を適用
router.use(rateLimit(200, 15 * 60 * 1000)); // 15分間に200リクエスト

// BadgeManager インスタンス
const badgeManager = new BadgeManager();

// ユーザープロフィール取得
router.get('/profile', async (req, res) => {
  try {
    const { user } = req;
    const stats = badgeManager.getUserBadgeStats(user.employeeId);
    const level = badgeManager.calculateEmployeeLevel(stats.totalPoints);

    const profile = {
      // 基本情報
      employeeId: user.employeeId,
      name: user.name,
      email: user.email,
      givenName: user.given_name,
      familyName: user.family_name,
      
      // 組織情報
      organization: user.organization || {},
      
      // バッジ統計
      badges: stats,
      level: level,
      
      // プロフィール更新日時
      lastUpdated: new Date().toISOString()
    };

    res.json(profile);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch user profile'
    });
  }
});

// ユーザーのバッジ一覧取得
router.get('/badges', async (req, res) => {
  try {
    const { user } = req;
    const { category, difficulty, sort = 'recent' } = req.query;

    let userBadges = badgeManager.getUserBadges(user.employeeId);

    // フィルタリング
    if (category) {
      userBadges = userBadges.filter(badge => badge.category_name === category);
    }
    
    if (difficulty) {
      userBadges = userBadges.filter(badge => badge.difficulty === difficulty);
    }

    // ソート
    switch (sort) {
      case 'points':
        userBadges.sort((a, b) => b.points - a.points);
        break;
      case 'name':
        userBadges.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'category':
        userBadges.sort((a, b) => a.category_name.localeCompare(b.category_name));
        break;
      case 'recent':
      default:
        userBadges.sort((a, b) => new Date(b.earned_at) - new Date(a.earned_at));
        break;
    }

    res.json({
      badges: userBadges,
      totalCount: userBadges.length,
      filters: { category, difficulty, sort }
    });
  } catch (error) {
    console.error('Badges fetch error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch user badges'
    });
  }
});

// 利用可能なバッジ一覧取得
router.get('/badges/available', async (req, res) => {
  try {
    const { user } = req;
    const { category, difficulty } = req.query;

    let allBadges = badgeManager.getAllBadges();
    const userBadges = badgeManager.getUserBadges(user.employeeId);
    const userBadgeIds = new Set(userBadges.map(ub => ub.badge_id));

    // まだ取得していないバッジのみ
    let availableBadges = allBadges.filter(badge => !userBadgeIds.has(badge.id));

    // フィルタリング
    if (category) {
      availableBadges = availableBadges.filter(badge => badge.category_name === category);
    }
    
    if (difficulty) {
      availableBadges = availableBadges.filter(badge => badge.difficulty === difficulty);
    }

    // 各バッジの取得確率を計算
    availableBadges = availableBadges.map(badge => {
      const employee = {
        employee_id: user.employeeId,
        department: user.organization?.department || 'Unknown',
        role: user.organization?.role || user.role || 'Employee',
        position: user.organization?.position || 'Employee'
      };
      
      const probability = badgeManager.calculateBadgeProbability(employee, badge);
      
      return {
        ...badge,
        probability: Math.round(probability * 100), // パーセント表示
        achievable: probability > 0
      };
    });

    // 取得可能性でソート
    availableBadges.sort((a, b) => b.probability - a.probability);

    res.json({
      badges: availableBadges,
      totalCount: availableBadges.length,
      achievableCount: availableBadges.filter(b => b.achievable).length
    });
  } catch (error) {
    console.error('Available badges fetch error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch available badges'
    });
  }
});

// バッジカテゴリ一覧取得
router.get('/categories', async (req, res) => {
  try {
    const stmt = badgeManager.db.prepare(`
      SELECT bc.*, 
             COUNT(b.id) as badge_count,
             COUNT(ub.id) as earned_count
      FROM badge_categories bc
      LEFT JOIN badges b ON bc.id = b.category_id AND b.is_active = 1
      LEFT JOIN user_badges ub ON b.id = ub.badge_id AND ub.employee_id = ?
      GROUP BY bc.id
      ORDER BY bc.name
    `);
    
    const categories = stmt.all(req.user.employeeId);

    res.json({ categories });
  } catch (error) {
    console.error('Categories fetch error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch badge categories'
    });
  }
});

// バッジランキング取得
router.get('/rankings', async (req, res) => {
  try {
    const { limit = 20, type = 'popular' } = req.query;
    
    let rankings;
    switch (type) {
      case 'popular':
        rankings = badgeManager.getBadgeRankings(parseInt(limit));
        break;
      case 'difficult':
        const stmt = badgeManager.db.prepare(`
          SELECT b.name, b.icon, b.difficulty, b.points,
                 COUNT(ub.id) as earned_count,
                 bc.name as category_name, bc.color as category_color
          FROM badges b
          LEFT JOIN user_badges ub ON b.id = ub.badge_id
          LEFT JOIN badge_categories bc ON b.category_id = bc.id
          WHERE b.is_active = 1
          GROUP BY b.id
          ORDER BY b.points DESC, earned_count ASC
          LIMIT ?
        `);
        rankings = stmt.all(parseInt(limit));
        break;
      default:
        rankings = badgeManager.getBadgeRankings(parseInt(limit));
    }

    res.json({
      rankings,
      type,
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Rankings fetch error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch badge rankings'
    });
  }
});

// 部署統計取得
router.get('/stats/departments', async (req, res) => {
  try {
    const stats = badgeManager.getDepartmentBadgeStats();
    res.json({ departmentStats: stats });
  } catch (error) {
    console.error('Department stats fetch error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch department statistics'
    });
  }
});

// システム統計取得
router.get('/stats/system', async (req, res) => {
  try {
    const stats = badgeManager.getSystemStats();
    res.json({ systemStats: stats });
  } catch (error) {
    console.error('System stats fetch error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch system statistics'
    });
  }
});

// 管理者専用: ユーザー一覧とバッジ統計
router.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, department, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT e.employee_id, e.name, e.email, e.department, e.team, e.position,
             COUNT(ub.id) as badge_count,
             SUM(b.points) as total_points
      FROM employees e
      LEFT JOIN user_badges ub ON e.employee_id = ub.employee_id
      LEFT JOIN badges b ON ub.badge_id = b.id
    `;
    
    const params = [];
    const conditions = [];

    if (department) {
      conditions.push('e.department = ?');
      params.push(department);
    }

    if (search) {
      conditions.push('(e.name LIKE ? OR e.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += `
      GROUP BY e.employee_id
      ORDER BY total_points DESC, badge_count DESC
      LIMIT ? OFFSET ?
    `;

    params.push(parseInt(limit), offset);

    const stmt = badgeManager.db.prepare(query);
    const users = stmt.all(...params);

    // 総件数取得
    let countQuery = 'SELECT COUNT(*) as total FROM employees e';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    const countStmt = badgeManager.db.prepare(countQuery);
    const { total } = countStmt.get(...params.slice(0, -2));

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Admin users fetch error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch user list'
    });
  }
});

// 管理者専用: バッジ付与
router.post('/admin/badges/award', requireAdmin, async (req, res) => {
  try {
    const { employeeId, badgeId, reason } = req.body;

    if (!employeeId || !badgeId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Employee ID and Badge ID are required'
      });
    }

    const result = badgeManager.awardBadge(employeeId, badgeId, reason || `Awarded by admin: ${req.user.name}`);

    res.json({
      success: true,
      message: 'Badge awarded successfully',
      awardId: result.id,
      verificationCode: result.verificationCode
    });
  } catch (error) {
    console.error('Badge award error:', error);
    
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Employee already has this badge'
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to award badge'
    });
  }
});

// エラーハンドラ
router.use((error, req, res, next) => {
  console.error('API Error:', {
    path: req.path,
    method: req.method,
    error: error.message,
    user: req.user?.employeeId
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred'
  });
});

export default router;