import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class BadgeManager {
  constructor(dbPath = path.join(__dirname, 'badge_demo.db')) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  // 従業員のバッジ取得確率を計算
  calculateBadgeProbability(employee, badge) {
    let probability = badge.base_probability;

    // 部署別乗数適用
    if (badge.department_multiplier) {
      const deptMultipliers = JSON.parse(badge.department_multiplier);
      const deptMultiplier = deptMultipliers[employee.department] || 1.0;
      probability *= deptMultiplier;
    }

    // 役職別乗数適用
    if (badge.position_multiplier) {
      const posMultipliers = JSON.parse(badge.position_multiplier);
      const posMultiplier = posMultipliers[employee.role] || posMultipliers[employee.position] || 1.0;
      probability *= posMultiplier;
    }

    // 前提条件チェック
    if (badge.prerequisites) {
      const prerequisites = JSON.parse(badge.prerequisites);
      if (!this.checkPrerequisites(employee.employee_id, prerequisites)) {
        return 0; // 前提条件を満たしていない
      }
    }

    // 確率を0-1の範囲に制限
    return Math.min(1.0, Math.max(0, probability));
  }

  // 前提条件チェック
  checkPrerequisites(employeeId, prerequisites) {
    if (!prerequisites || prerequisites.length === 0) return true;

    const userBadges = this.getUserBadges(employeeId);
    const userBadgeIds = userBadges.map(ub => ub.badge_id);

    // すべての前提条件バッジを持っているかチェック
    return prerequisites.every(reqBadgeId => userBadgeIds.includes(reqBadgeId));
  }

  // 従業員にランダムバッジを付与
  assignRandomBadges(employee) {
    const badges = this.getAllBadges();
    const assignedBadges = [];

    for (const badge of badges) {
      const probability = this.calculateBadgeProbability(employee, badge);
      
      if (probability > 0 && Math.random() < probability) {
        try {
          this.awardBadge(employee.employee_id, badge.id, 'Random assignment during setup');
          assignedBadges.push({
            badgeId: badge.id,
            badgeName: badge.name,
            probability: probability,
            points: badge.points
          });
        } catch (error) {
          // バッジが既に付与されている場合は無視
          if (!error.message.includes('UNIQUE constraint failed')) {
            console.error(`Error awarding badge ${badge.name} to ${employee.name}:`, error.message);
          }
        }
      }
    }

    return assignedBadges;
  }

  // バッジ付与
  awardBadge(employeeId, badgeId, reason = null) {
    const stmt = this.db.prepare(`
      INSERT INTO user_badges (employee_id, badge_id, earned_at, verification_code, notes)
      VALUES (?, ?, datetime('now'), ?, ?)
    `);
    
    const verificationCode = this.generateVerificationCode();
    const result = stmt.run(employeeId, badgeId, verificationCode, reason);

    // 履歴記録
    this.recordBadgeHistory(employeeId, badgeId, 'earned', reason);

    return {
      id: result.lastInsertRowid,
      verificationCode: verificationCode
    };
  }

  // 検証コード生成
  generateVerificationCode() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // バッジ履歴記録
  recordBadgeHistory(employeeId, badgeId, action, reason, performedBy = 'system') {
    const stmt = this.db.prepare(`
      INSERT INTO badge_history (employee_id, badge_id, action, reason, performed_by)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(employeeId, badgeId, action, reason, performedBy);
  }

  // 全バッジ取得
  getAllBadges() {
    const stmt = this.db.prepare(`
      SELECT b.*, bc.name as category_name, bc.color as category_color, bc.icon as category_icon
      FROM badges b
      JOIN badge_categories bc ON b.category_id = bc.id
      WHERE b.is_active = 1
      ORDER BY bc.name, b.difficulty, b.name
    `);
    
    return stmt.all();
  }

  // ユーザーバッジ取得
  getUserBadges(employeeId) {
    const stmt = this.db.prepare(`
      SELECT ub.*, b.name, b.description, b.icon, b.difficulty, b.points,
             bc.name as category_name, bc.color as category_color, bc.icon as category_icon
      FROM user_badges ub
      JOIN badges b ON ub.badge_id = b.id
      JOIN badge_categories bc ON b.category_id = bc.id
      WHERE ub.employee_id = ?
      ORDER BY ub.earned_at DESC
    `);
    
    return stmt.all(employeeId);
  }

  // ユーザーバッジ統計
  getUserBadgeStats(employeeId) {
    const userBadges = this.getUserBadges(employeeId);
    const allBadges = this.getAllBadges();

    const stats = {
      totalBadges: userBadges.length,
      totalPoints: userBadges.reduce((sum, badge) => sum + badge.points, 0),
      categoriesCount: new Set(userBadges.map(b => b.category_name)).size,
      recentBadges: userBadges.filter(b => {
        const earnedDate = new Date(b.earned_at);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return earnedDate > thirtyDaysAgo;
      }).length,
      difficultyBreakdown: {
        beginner: userBadges.filter(b => b.difficulty === 'beginner').length,
        intermediate: userBadges.filter(b => b.difficulty === 'intermediate').length,
        advanced: userBadges.filter(b => b.difficulty === 'advanced').length,
        expert: userBadges.filter(b => b.difficulty === 'expert').length
      },
      categoryBreakdown: {},
      completionRate: (userBadges.length / allBadges.length * 100).toFixed(1)
    };

    // カテゴリ別統計
    userBadges.forEach(badge => {
      if (!stats.categoryBreakdown[badge.category_name]) {
        stats.categoryBreakdown[badge.category_name] = 0;
      }
      stats.categoryBreakdown[badge.category_name]++;
    });

    return stats;
  }

  // 従業員レベル計算
  calculateEmployeeLevel(totalPoints) {
    if (totalPoints < 500) return { level: 1, title: 'Novice', nextLevelPoints: 500 };
    if (totalPoints < 1500) return { level: 2, title: 'Apprentice', nextLevelPoints: 1500 };
    if (totalPoints < 3000) return { level: 3, title: 'Skilled', nextLevelPoints: 3000 };
    if (totalPoints < 5000) return { level: 4, title: 'Expert', nextLevelPoints: 5000 };
    if (totalPoints < 8000) return { level: 5, title: 'Master', nextLevelPoints: 8000 };
    if (totalPoints < 12000) return { level: 6, title: 'Grandmaster', nextLevelPoints: 12000 };
    return { level: 7, title: 'Legend', nextLevelPoints: null };
  }

  // バッジランキング取得
  getBadgeRankings(limit = 10) {
    const stmt = this.db.prepare(`
      SELECT b.name, b.icon, b.difficulty, b.points,
             COUNT(ub.id) as earned_count,
             bc.name as category_name, bc.color as category_color
      FROM badges b
      LEFT JOIN user_badges ub ON b.id = ub.badge_id
      LEFT JOIN badge_categories bc ON b.category_id = bc.id
      WHERE b.is_active = 1
      GROUP BY b.id
      ORDER BY earned_count DESC, b.points DESC
      LIMIT ?
    `);
    
    return stmt.all(limit);
  }

  // 部署別バッジ統計
  getDepartmentBadgeStats() {
    const stmt = this.db.prepare(`
      SELECT e.department, 
             COUNT(DISTINCT e.employee_id) as employee_count,
             COUNT(ub.id) as total_badges,
             SUM(b.points) as total_points,
             AVG(b.points) as avg_points_per_badge
      FROM employees e
      LEFT JOIN user_badges ub ON e.employee_id = ub.employee_id
      LEFT JOIN badges b ON ub.badge_id = b.id
      GROUP BY e.department
      ORDER BY total_points DESC
    `);
    
    return stmt.all();
  }

  // データベース統計
  getSystemStats() {
    const totalEmployees = this.db.prepare('SELECT COUNT(*) as count FROM employees').get().count;
    const totalBadges = this.db.prepare('SELECT COUNT(*) as count FROM badges WHERE is_active = 1').get().count;
    const totalAwards = this.db.prepare('SELECT COUNT(*) as count FROM user_badges').get().count;
    const activeCategories = this.db.prepare('SELECT COUNT(*) as count FROM badge_categories').get().count;

    return {
      totalEmployees,
      totalBadges,
      totalAwards,
      activeCategories,
      averageBadgesPerEmployee: totalEmployees > 0 ? (totalAwards / totalEmployees).toFixed(1) : 0
    };
  }

  close() {
    this.db.close();
  }
}

export default BadgeManager;