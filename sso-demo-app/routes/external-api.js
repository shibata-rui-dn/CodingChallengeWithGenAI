import express from 'express';
import BadgeManager from '../database/badges.js';
import { rateLimit } from '../middleware/auth.js';

const router = express.Router();

// 外部API用のレート制限（バルク処理は緩和）
router.use((req, res, next) => {
  // 一括処理エンドポイントは特別なレート制限
  if (req.path === '/badges/bulk') {
    return rateLimit(10, 60 * 60 * 1000)(req, res, next); // 1時間に10リクエスト
  }
  // その他のエンドポイントは通常のレート制限
  return rateLimit(50, 15 * 60 * 1000)(req, res, next); // 15分間に50リクエスト
});

// BadgeManager インスタンス
const badgeManager = new BadgeManager();

/**
 * 外部システム用認証ミドルウェア
 * SSO認証済みのトークンを検証し、外部システムからのアクセスを許可
 */
async function externalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Bearer token required for external API access',
      code: 'MISSING_TOKEN'
    });
  }

  const token = authHeader.substring(7);

  try {
    // 認証サーバーでトークンを検証
    const axios = (await import('axios')).default;
    const SSO_AUTH_SERVER = process.env.SSO_AUTH_SERVER || 'http://localhost:3303';

    console.log('External API: トークン検証開始', {
      endpoint: req.path,
      token: token.substring(0, 10) + '...',
      ip: req.ip
    });

    const response = await axios.get(`${SSO_AUTH_SERVER}/userinfo`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      timeout: 10000
    });

    const userInfo = response.data;

    // 外部システムアクセス権限をチェック
    const hasExternalAccess = checkExternalAccess(userInfo);

    if (!hasExternalAccess) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient privileges for external API access',
        code: 'INSUFFICIENT_PRIVILEGES'
      });
    }

    // ユーザー情報をリクエストに追加
    req.externalUser = {
      ...userInfo,
      employeeId: userInfo.email || userInfo.preferred_username || userInfo.sub,
      isExternalAccess: true
    };

    console.log('External API: 認証成功', {
      userId: req.externalUser.employeeId,
      name: req.externalUser.name,
      endpoint: req.path
    });

    next();

  } catch (error) {
    console.error('External API: 認証エラー', {
      error: error.message,
      status: error.response?.status,
      endpoint: req.path
    });

    if (error.response?.status === 401) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    return res.status(500).json({
      error: 'Authentication Error',
      message: 'Failed to verify external access token',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
}

/**
 * 外部システムアクセス権限をチェック
 */
function checkExternalAccess(userInfo) {
  // すべての認証済みユーザーに外部APIアクセスを許可
  return true;
}

// すべての外部APIエンドポイントに認証を適用
router.use(externalAuthMiddleware);

/**
 * 指定ユーザーのバッジ情報取得
 * GET /external-api/badges/user/:employeeId
 */
router.get('/badges/user/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { includeStats = false } = req.query;

    // 従業員の存在確認
    const employee = badgeManager.db.prepare('SELECT * FROM employees WHERE employee_id = ?').get(employeeId);

    if (!employee) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Employee not found',
        code: 'EMPLOYEE_NOT_FOUND',
        employeeId
      });
    }

    // バッジ情報取得
    const userBadges = badgeManager.getUserBadges(employeeId);

    let response = {
      employeeId,
      employee: {
        name: employee.name,
        email: employee.email,
        department: employee.department,
        team: employee.team,
        position: employee.position
      },
      badges: userBadges,
      badgeCount: userBadges.length,
      totalPoints: userBadges.reduce((sum, badge) => sum + badge.points, 0),
      lastUpdated: new Date().toISOString(),
      requestedBy: req.externalUser.employeeId
    };

    // 詳細統計が要求された場合
    if (includeStats === 'true') {
      const stats = badgeManager.getUserBadgeStats(employeeId);
      const level = badgeManager.calculateEmployeeLevel(stats.totalPoints);

      response.detailedStats = stats;
      response.level = level;
    }

    // ログ記録
    console.log('External API: ユーザーバッジ情報提供', {
      targetEmployee: employeeId,
      requestedBy: req.externalUser.employeeId,
      badgeCount: userBadges.length,
      includeStats
    });

    res.json(response);

  } catch (error) {
    console.error('External API: ユーザーバッジ取得エラー:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch user badges',
      code: 'FETCH_ERROR'
    });
  }
});

/**
 * 部署のバッジ統計取得
 * GET /external-api/badges/department/:department
 */
router.get('/badges/department/:department', async (req, res) => {
  try {
    const { department } = req.params;
    const { limit = 100 } = req.query;

    // 部署の従業員とバッジ情報を取得
    const stmt = badgeManager.db.prepare(`
      SELECT e.employee_id, e.name, e.email, e.team, e.position,
             COUNT(ub.id) as badge_count,
             SUM(b.points) as total_points
      FROM employees e
      LEFT JOIN user_badges ub ON e.employee_id = ub.employee_id
      LEFT JOIN badges b ON ub.badge_id = b.id
      WHERE e.department = ?
      GROUP BY e.employee_id
      ORDER BY total_points DESC, badge_count DESC
      LIMIT ?
    `);

    const employees = stmt.all(department, parseInt(limit));

    if (employees.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Department not found or has no employees',
        code: 'DEPARTMENT_NOT_FOUND',
        department
      });
    }

    // 部署統計計算
    const departmentStats = {
      employeeCount: employees.length,
      totalBadges: employees.reduce((sum, emp) => sum + emp.badge_count, 0),
      totalPoints: employees.reduce((sum, emp) => sum + (emp.total_points || 0), 0),
      averageBadgesPerEmployee: 0,
      averagePointsPerEmployee: 0
    };

    departmentStats.averageBadgesPerEmployee = departmentStats.totalBadges / departmentStats.employeeCount;
    departmentStats.averagePointsPerEmployee = departmentStats.totalPoints / departmentStats.employeeCount;

    const response = {
      department,
      stats: departmentStats,
      employees: employees,
      lastUpdated: new Date().toISOString(),
      requestedBy: req.externalUser.employeeId
    };

    console.log('External API: 部署バッジ統計提供', {
      department,
      employeeCount: employees.length,
      requestedBy: req.externalUser.employeeId
    });

    res.json(response);

  } catch (error) {
    console.error('External API: 部署統計取得エラー:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch department statistics',
      code: 'FETCH_ERROR'
    });
  }
});

/**
 * 複数ユーザーのバッジ情報を一括取得（最大10万名対応）
 * POST /external-api/badges/bulk
 */
router.post('/badges/bulk', async (req, res) => {
  try {
    const { employeeIds, includeStats = false, batchSize = 1000 } = req.body;

    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'employeeIds array is required',
        code: 'INVALID_INPUT'
      });
    }

    if (employeeIds.length > 100000) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Maximum 100,000 employees per request',
        code: 'TOO_MANY_EMPLOYEES'
      });
    }

    // バッチサイズの調整（1000〜10000の範囲）
    const effectiveBatchSize = Math.min(Math.max(batchSize, 1000), 10000);

    console.log('External API: 一括取得開始', {
      totalEmployees: employeeIds.length,
      batchSize: effectiveBatchSize,
      includeStats,
      requestedBy: req.externalUser.employeeId
    });

    const startTime = Date.now();
    const results = [];
    const notFound = [];
    const errors = [];
    let processed = 0;

    // バッチ処理で分割実行
    for (let i = 0; i < employeeIds.length; i += effectiveBatchSize) {
      const batch = employeeIds.slice(i, i + effectiveBatchSize);

      try {
        // SQL INクエリを使用した最適化された一括取得
        const placeholders = batch.map(() => '?').join(',');
        const employeesStmt = badgeManager.db.prepare(`
          SELECT employee_id, name, email, department, team, position 
          FROM employees 
          WHERE employee_id IN (${placeholders})
        `);
        const employees = employeesStmt.all(...batch);
        const foundEmployeeIds = new Set(employees.map(emp => emp.employee_id));

        // 見つからない従業員をnotFoundに追加
        batch.forEach(id => {
          if (!foundEmployeeIds.has(id)) {
            notFound.push(id);
          }
        });

        // バッジ情報を一括取得
        const badgesStmt = badgeManager.db.prepare(`
          SELECT ub.employee_id, ub.badge_id, ub.earned_at, ub.verification_code, ub.notes,
                 b.name, b.description, b.icon, b.difficulty, b.points,
                 bc.name as category_name, bc.color as category_color, bc.icon as category_icon
          FROM user_badges ub
          JOIN badges b ON ub.badge_id = b.id
          JOIN badge_categories bc ON b.category_id = bc.id
          WHERE ub.employee_id IN (${placeholders})
          ORDER BY ub.earned_at DESC
        `);
        const allBadges = badgesStmt.all(...batch);

        // 従業員ごとにバッジをグループ化
        const badgesByEmployee = {};
        allBadges.forEach(badge => {
          if (!badgesByEmployee[badge.employee_id]) {
            badgesByEmployee[badge.employee_id] = [];
          }
          badgesByEmployee[badge.employee_id].push(badge);
        });

        // レスポンスデータを構築
        for (const employee of employees) {
          try {
            const userBadges = badgesByEmployee[employee.employee_id] || [];
            const totalPoints = userBadges.reduce((sum, badge) => sum + badge.points, 0);

            let employeeData = {
              employeeId: employee.employee_id,
              employee: {
                name: employee.name,
                email: employee.email,
                department: employee.department,
                team: employee.team,
                position: employee.position
              },
              badges: userBadges,
              badgeCount: userBadges.length,
              totalPoints: totalPoints
            };

            // 詳細統計が要求された場合（大量データ時はパフォーマンスを考慮）
            if (includeStats) {
              if (employeeIds.length <= 10000) {
                // 1万名以下の場合のみ詳細統計を含める
                const stats = badgeManager.getUserBadgeStats(employee.employee_id);
                const level = badgeManager.calculateEmployeeLevel(stats.totalPoints);

                employeeData.detailedStats = stats;
                employeeData.level = level;
              } else {
                // 大量データの場合は基本統計のみ
                employeeData.level = badgeManager.calculateEmployeeLevel(totalPoints);
                employeeData.detailedStats = {
                  totalBadges: userBadges.length,
                  totalPoints: totalPoints,
                  note: 'Limited stats for large datasets'
                };
              }
            }

            results.push(employeeData);
            processed++;

          } catch (empError) {
            console.error(`従業員データ処理エラー (${employee.employee_id}):`, empError);
            errors.push({
              employeeId: employee.employee_id,
              error: empError.message
            });
          }
        }

        // 進捗ログ（大量データの場合）
        if (employeeIds.length > 5000 && i % (effectiveBatchSize * 5) === 0) {
          const progress = ((i + batch.length) / employeeIds.length * 100).toFixed(1);
          console.log(`一括取得進捗: ${progress}% (${i + batch.length}/${employeeIds.length})`);
        }

      } catch (batchError) {
        console.error(`バッチ処理エラー (batch ${i}-${i + batch.length}):`, batchError);
        // バッチ全体がエラーの場合、そのバッチの全員をエラーに追加
        batch.forEach(id => {
          errors.push({
            employeeId: id,
            error: 'Batch processing failed'
          });
        });
      }

      // メモリ管理: 大量データの場合はガベージコレクションを促進
      if (employeeIds.length > 50000 && i % (effectiveBatchSize * 10) === 0) {
        if (global.gc) {
          global.gc();
        }
      }
    }

    const processingTime = Date.now() - startTime;

    const response = {
      requested: employeeIds.length,
      processed: processed,
      found: results.length,
      notFound: notFound.length,
      errors: errors.length,
      performance: {
        processingTimeMs: processingTime,
        batchSize: effectiveBatchSize,
        avgTimePerEmployee: processed > 0 ? (processingTime / processed).toFixed(2) : 0
      },
      results,
      notFoundEmployees: notFound,
      processingErrors: errors.length > 0 ? errors.slice(0, 100) : [], // 最初の100件のエラーのみ返却
      lastUpdated: new Date().toISOString(),
      requestedBy: req.externalUser.employeeId,
      dataLimitations: employeeIds.length > 10000 && includeStats ? {
        detailedStats: 'Limited for performance with large datasets (>10,000 employees)'
      } : null
    };

    console.log('External API: 一括バッジ情報提供完了', {
      requested: employeeIds.length,
      processed: processed,
      found: results.length,
      notFound: notFound.length,
      errors: errors.length,
      processingTimeMs: processingTime,
      requestedBy: req.externalUser.employeeId
    });

    res.json(response);

  } catch (error) {
    console.error('External API: 一括取得エラー:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch bulk badge data',
      code: 'FETCH_ERROR',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/**
 * バッジ検索
 * GET /external-api/badges/search
 */
router.get('/badges/search', async (req, res) => {
  try {
    const {
      department,
      badgeName,
      minPoints,
      maxPoints,
      difficulty,
      limit = 50
    } = req.query;

    let query = `
      SELECT e.employee_id, e.name, e.email, e.department, e.team, e.position,
             b.name as badge_name, b.points, b.difficulty, b.icon,
             ub.earned_at, bc.name as category_name
      FROM employees e
      JOIN user_badges ub ON e.employee_id = ub.employee_id
      JOIN badges b ON ub.badge_id = b.id
      JOIN badge_categories bc ON b.category_id = bc.id
      WHERE 1=1
    `;

    const params = [];

    if (department) {
      query += ' AND e.department = ?';
      params.push(department);
    }

    if (badgeName) {
      query += ' AND b.name LIKE ?';
      params.push(`%${badgeName}%`);
    }

    if (minPoints) {
      query += ' AND b.points >= ?';
      params.push(parseInt(minPoints));
    }

    if (maxPoints) {
      query += ' AND b.points <= ?';
      params.push(parseInt(maxPoints));
    }

    if (difficulty) {
      query += ' AND b.difficulty = ?';
      params.push(difficulty);
    }

    query += ' ORDER BY ub.earned_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const stmt = badgeManager.db.prepare(query);
    const results = stmt.all(...params);

    const response = {
      searchCriteria: {
        department,
        badgeName,
        minPoints,
        maxPoints,
        difficulty,
        limit: parseInt(limit)
      },
      resultCount: results.length,
      results,
      lastUpdated: new Date().toISOString(),
      requestedBy: req.externalUser.employeeId
    };

    console.log('External API: バッジ検索実行', {
      criteria: response.searchCriteria,
      resultCount: results.length,
      requestedBy: req.externalUser.employeeId
    });

    res.json(response);

  } catch (error) {
    console.error('External API: バッジ検索エラー:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to search badges',
      code: 'SEARCH_ERROR'
    });
  }
});

/**
 * システム全体統計
 * GET /external-api/stats/system
 */
router.get('/stats/system', async (req, res) => {
  try {
    const systemStats = badgeManager.getSystemStats();
    const departmentStats = badgeManager.getDepartmentBadgeStats();
    const badgeRankings = badgeManager.getBadgeRankings(20);

    const response = {
      systemStats,
      departmentStats,
      popularBadges: badgeRankings,
      lastUpdated: new Date().toISOString(),
      requestedBy: req.externalUser.employeeId
    };

    console.log('External API: システム統計提供', {
      requestedBy: req.externalUser.employeeId
    });

    res.json(response);

  } catch (error) {
    console.error('External API: システム統計取得エラー:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch system statistics',
      code: 'STATS_ERROR'
    });
  }
});

/**
 * API使用状況とドキュメント
 * GET /external-api/info
 */
router.get('/info', (req, res) => {
  const apiInfo = {
    name: 'Badge Management External API',
    version: '1.0.0',
    description: 'External API for accessing employee badge information',
    authentication: 'Bearer Token (SSO)',
    endpoints: [
      {
        path: '/external-api/badges/user/:employeeId',
        method: 'GET',
        description: 'Get badges for specific employee',
        parameters: {
          employeeId: 'Employee ID (email-based)',
          includeStats: 'Include detailed statistics (true/false)'
        }
      },
      {
        path: '/external-api/badges/department/:department',
        method: 'GET',
        description: 'Get badge statistics for department',
        parameters: {
          department: 'Department name',
          limit: 'Maximum employees to return (default: 100)'
        }
      },
      {
        path: '/external-api/badges/bulk',
        method: 'POST',
        description: 'Get badges for multiple employees',
        body: {
          employeeIds: 'Array of employee IDs (max 100)',
          includeStats: 'Include detailed statistics (true/false)'
        }
      },
      {
        path: '/external-api/badges/search',
        method: 'GET',
        description: 'Search badges by criteria',
        parameters: {
          department: 'Filter by department',
          badgeName: 'Filter by badge name (partial match)',
          minPoints: 'Minimum badge points',
          maxPoints: 'Maximum badge points',
          difficulty: 'Badge difficulty level',
          limit: 'Maximum results (default: 50)'
        }
      },
      {
        path: '/external-api/stats/system',
        method: 'GET',
        description: 'Get system-wide badge statistics'
      }
    ],
    authorization: {
      required_roles: ['admin', 'CEO', 'CTO', 'CPO'],
      required_departments: ['HR', '人事部'],
      required_positions: ['System Admin']
    },
    rate_limits: {
      requests_per_15_minutes: 50
    },
    lastUpdated: new Date().toISOString(),
    requestedBy: req.externalUser.employeeId
  };

  res.json(apiInfo);
});

// エラーハンドラ
router.use((error, req, res, next) => {
  console.error('External API Error:', {
    path: req.path,
    method: req.method,
    error: error.message,
    user: req.externalUser?.employeeId
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred in external API',
    code: 'EXTERNAL_API_ERROR'
  });
});

export default router;