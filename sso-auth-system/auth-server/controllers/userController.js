import bcrypt from 'bcrypt';
import pool from '../../config/database.js';
import { getUserRole } from '../middleware/rbac.js';

async function getConfigSafely() {
  try {
    const { getConfig } = await import('../../config/configLoader.js');
    return getConfig();
  } catch (error) {
    console.error('Config loading error:', error);
    return {
      security: {
        bcrypt_rounds: 12
      }
    };
  }
}

class UserController {
  // ユーザー一覧取得
  async listUsers(req, res) {
    try {
      const { page = 1, limit = 10, search = '', role = '' } = req.query;
      const offset = (page - 1) * limit;

      // 🔧 修正: 組織情報フィールドを追加
      let query = `
        SELECT id, username, email, first_name, last_name, department, team, supervisor, role, is_active, created_at, updated_at
        FROM users
        WHERE 1=1
      `;
      let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
      const params = [];
      const countParams = [];

      // 検索条件の追加
      if (search) {
        query += ` AND (username LIKE ? OR email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)`;
        countQuery += ` AND (username LIKE ? OR email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)`;
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        countParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
      }

      // 役割フィルター
      if (role) {
        query += ` AND role = ?`;
        countQuery += ` AND role = ?`;
        params.push(role);
        countParams.push(role);
      }

      query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), offset);

      const [usersResult, countResult] = await Promise.all([
        pool.query(query, params),
        pool.query(countQuery, countParams)
      ]);

      const users = usersResult.rows.map(user => ({
        ...user,
        password_hash: undefined // パスワードハッシュは除外
      }));

      res.json({
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult.rows[0].total,
          pages: Math.ceil(countResult.rows[0].total / limit)
        }
      });
    } catch (error) {
      console.error('List users error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ユーザー詳細取得
  async getUser(req, res) {
    try {
      const { id } = req.params;

      // 🔧 修正: 組織情報フィールドを追加
      const result = await pool.query(
        'SELECT id, username, email, first_name, last_name, department, team, supervisor, role, is_active, created_at, updated_at FROM users WHERE id = ?',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'user_not_found',
          error_description: 'User not found' 
        });
      }

      res.json({ user: result.rows[0] });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ユーザー作成
  async createUser(req, res) {
    try {
      const { username, email, password, first_name, last_name, department, team, supervisor, role = 'user' } = req.body;

      // バリデーション
      if (!username || !email || !password) {
        return res.status(400).json({ 
          error: 'invalid_request',
          error_description: 'Username, email, and password are required' 
        });
      }

      // メールフォーマットチェック
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ 
          error: 'invalid_email',
          error_description: 'Invalid email format' 
        });
      }

      // パスワード強度チェック
      if (password.length < 6) {
        return res.status(400).json({ 
          error: 'weak_password',
          error_description: 'Password must be at least 6 characters long' 
        });
      }

      // 役割の検証
      if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({ 
          error: 'invalid_role',
          error_description: 'Role must be either "admin" or "user"' 
        });
      }

      // 重複チェック
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username, email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({ 
          error: 'user_exists',
          error_description: 'Username or email already exists' 
        });
      }

      // パスワードハッシュ化
      const config = await getConfigSafely();
      const bcryptRounds = config.security?.bcrypt_rounds || 12;
      const passwordHash = await bcrypt.hash(password, bcryptRounds);

      // 🔧 修正: 組織情報フィールドを含むユーザー作成
      const insertResult = await pool.query(
        `INSERT INTO users (username, email, password_hash, first_name, last_name, department, team, supervisor, role, is_active) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          username, 
          email, 
          passwordHash, 
          first_name || null, 
          last_name || null, 
          department || '-',
          team || '-',
          supervisor || '-',
          role
        ]
      );

      // 🔧 修正: 作成されたユーザー情報を取得（組織情報含む）
      const newUserResult = await pool.query(
        'SELECT id, username, email, first_name, last_name, department, team, supervisor, role, is_active, created_at FROM users WHERE id = ?',
        [insertResult.lastInsertRowid]
      );

      res.status(201).json({
        message: 'User created successfully',
        user: newUserResult.rows[0]
      });

    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ユーザー更新
  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { username, email, first_name, last_name, department, team, supervisor, role, is_active, password } = req.body;

      // ユーザー存在確認
      const existingUserResult = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
      
      if (existingUserResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'user_not_found',
          error_description: 'User not found' 
        });
      }

      const existingUser = existingUserResult.rows[0];

      // 自分のadmin権限を削除しようとしていないかチェック
      const currentUserId = req.user?.sub;
      if (currentUserId && currentUserId.toString() === id.toString() && 
          existingUser.role === 'admin' && role && role !== 'admin') {
        return res.status(400).json({ 
          error: 'cannot_remove_own_admin',
          error_description: 'Cannot remove admin role from your own account' 
        });
      }

      // 更新フィールドの準備
      const updateFields = [];
      const updateParams = [];

      if (username !== undefined) {
        // ユーザー名の重複チェック
        const duplicateCheck = await pool.query(
          'SELECT id FROM users WHERE username = ? AND id != ?',
          [username, id]
        );
        if (duplicateCheck.rows.length > 0) {
          return res.status(409).json({ 
            error: 'username_exists',
            error_description: 'Username already exists' 
          });
        }
        updateFields.push('username = ?');
        updateParams.push(username);
      }

      if (email !== undefined) {
        // メール形式チェック
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ 
            error: 'invalid_email',
            error_description: 'Invalid email format' 
          });
        }
        
        // メールの重複チェック
        const duplicateCheck = await pool.query(
          'SELECT id FROM users WHERE email = ? AND id != ?',
          [email, id]
        );
        if (duplicateCheck.rows.length > 0) {
          return res.status(409).json({ 
            error: 'email_exists',
            error_description: 'Email already exists' 
          });
        }
        updateFields.push('email = ?');
        updateParams.push(email);
      }

      if (first_name !== undefined) {
        updateFields.push('first_name = ?');
        updateParams.push(first_name || null);
      }

      if (last_name !== undefined) {
        updateFields.push('last_name = ?');
        updateParams.push(last_name || null);
      }

      // 🔧 修正: 組織情報フィールドの更新処理を追加
      if (department !== undefined) {
        updateFields.push('department = ?');
        updateParams.push(department || '-');
      }

      if (team !== undefined) {
        updateFields.push('team = ?');
        updateParams.push(team || '-');
      }

      if (supervisor !== undefined) {
        updateFields.push('supervisor = ?');
        updateParams.push(supervisor || '-');
      }

      if (role !== undefined) {
        if (!['admin', 'user'].includes(role)) {
          return res.status(400).json({ 
            error: 'invalid_role',
            error_description: 'Role must be either "admin" or "user"' 
          });
        }
        updateFields.push('role = ?');
        updateParams.push(role);
      }

      if (is_active !== undefined) {
        updateFields.push('is_active = ?');
        updateParams.push(is_active ? 1 : 0);
      }

      if (password) {
        if (password.length < 6) {
          return res.status(400).json({ 
            error: 'weak_password',
            error_description: 'Password must be at least 6 characters long' 
          });
        }
        
        const config = await getConfigSafely();
        const bcryptRounds = config.security?.bcrypt_rounds || 12;
        const passwordHash = await bcrypt.hash(password, bcryptRounds);
        
        updateFields.push('password_hash = ?');
        updateParams.push(passwordHash);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ 
          error: 'no_updates',
          error_description: 'No valid fields to update' 
        });
      }

      // updated_atフィールドを追加
      updateFields.push('updated_at = datetime(\'now\')');

      // 更新実行
      updateParams.push(id);
      const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
      
      const updateResult = await pool.query(updateQuery, updateParams);

      if (updateResult.rowCount === 0) {
        return res.status(404).json({ 
          error: 'user_not_found',
          error_description: 'User not found' 
        });
      }

      // 🔧 修正: 更新されたユーザー情報を取得（組織情報含む）
      const updatedUserResult = await pool.query(
        'SELECT id, username, email, first_name, last_name, department, team, supervisor, role, is_active, created_at, updated_at FROM users WHERE id = ?',
        [id]
      );

      res.json({
        message: 'User updated successfully',
        user: updatedUserResult.rows[0]
      });

    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ユーザー削除
  async deleteUser(req, res) {
    try {
      const { id } = req.params;
      const currentUserId = req.user?.sub;

      // 自分自身を削除しようとしていないかチェック
      if (currentUserId && currentUserId.toString() === id.toString()) {
        return res.status(400).json({ 
          error: 'cannot_delete_self',
          error_description: 'Cannot delete your own account' 
        });
      }

      // ユーザー存在確認
      const existingUserResult = await pool.query(
        'SELECT username, role FROM users WHERE id = ?',
        [id]
      );

      if (existingUserResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'user_not_found',
          error_description: 'User not found' 
        });
      }

      const userToDelete = existingUserResult.rows[0];

      // 削除実行
      const deleteResult = await pool.query('DELETE FROM users WHERE id = ?', [id]);

      if (deleteResult.rowCount === 0) {
        return res.status(404).json({ 
          error: 'user_not_found',
          error_description: 'User not found' 
        });
      }

      res.json({
        message: 'User deleted successfully',
        deleted_user: {
          id: parseInt(id),
          username: userToDelete.username
        }
      });

    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ユーザー統計情報
  async getUserStats(req, res) {
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total_users,
          SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admin_count,
          SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as user_count,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users,
          SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive_users
        FROM users
      `;

      const result = await pool.query(statsQuery);
      const stats = result.rows[0];

      res.json({ stats });
    } catch (error) {
      console.error('Get user stats error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default new UserController();