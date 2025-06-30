-- バッジ管理システム データベーススキーマ

-- 従業員テーブル（SSO連携用）
CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    department TEXT NOT NULL,
    team TEXT NOT NULL,
    position TEXT,
    role TEXT,
    supervisor TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- バッジカテゴリテーブル
CREATE TABLE IF NOT EXISTS badge_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3B82F6',
    icon TEXT DEFAULT '🏆',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- バッジテーブル
CREATE TABLE IF NOT EXISTS badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    icon TEXT DEFAULT '🏅',
    difficulty TEXT CHECK(difficulty IN ('beginner', 'intermediate', 'advanced', 'expert')) DEFAULT 'intermediate',
    base_probability REAL DEFAULT 0.15, -- 基本取得確率
    department_multiplier TEXT, -- 部署別乗数 (JSON)
    position_multiplier TEXT,   -- 役職別乗数 (JSON)
    prerequisites TEXT,         -- 前提条件 (JSON)
    points INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES badge_categories(id) ON DELETE CASCADE
);

-- ユーザーバッジテーブル（取得済みバッジ）
CREATE TABLE IF NOT EXISTS user_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL,
    badge_id INTEGER NOT NULL,
    earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    verification_code TEXT,
    notes TEXT,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE,
    UNIQUE(employee_id, badge_id)
);

-- バッジ取得履歴テーブル
CREATE TABLE IF NOT EXISTS badge_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL,
    badge_id INTEGER NOT NULL,
    action TEXT CHECK(action IN ('earned', 'revoked', 'expired')) NOT NULL,
    reason TEXT,
    performed_by TEXT,
    performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_team ON employees(team);
CREATE INDEX IF NOT EXISTS idx_user_badges_employee ON user_badges(employee_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_badge_history_employee ON badge_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_badges_category ON badges(category_id);
CREATE INDEX IF NOT EXISTS idx_badges_difficulty ON badges(difficulty);

-- 初期データ: バッジカテゴリ
INSERT OR IGNORE INTO badge_categories (name, description, color, icon) VALUES
('Cloud', 'クラウドプラットフォーム関連資格', '#FF6B35', '☁️'),
('Security', 'セキュリティ関連資格', '#D32F2F', '🔒'),
('Project Management', 'プロジェクト管理関連資格', '#8E24AA', '📊'),
('Programming', 'プログラミング言語関連資格', '#2E7D32', '💻'),
('DevOps', 'DevOps・インフラ関連資格', '#1565C0', '⚙️'),
('Data', 'データサイエンス・AI関連資格', '#E65100', '📈'),
('Architecture', 'システム設計・アーキテクチャ関連資格', '#5D4037', '🏗️'),
('General IT', '一般IT関連資格', '#37474F', '🔧');

-- 初期データ: バッジ
INSERT OR IGNORE INTO badges (category_id, name, description, icon, difficulty, base_probability, department_multiplier, position_multiplier, points) VALUES
-- Cloud関連
(1, 'AWS Certified Solutions Architect - Associate', 'AWS設計・構築の基礎知識を証明', '🏗️', 'intermediate', 0.15, '{"エンジニアリング部": 2.0, "インフラ部": 2.5, "営業部": 0.3}', '{"Engineer": 2.0, "Senior Engineer": 1.8, "Lead": 1.5}', 200),
(1, 'AWS Certified Developer - Associate', 'AWSアプリケーション開発スキルを証明', '👨‍💻', 'intermediate', 0.12, '{"エンジニアリング部": 2.2, "開発部": 2.8}', '{"Engineer": 2.5, "Senior Engineer": 2.0}', 180),
(1, 'Google Cloud Professional Cloud Architect', 'GCPアーキテクチャ設計の専門知識', '🌟', 'advanced', 0.08, '{"エンジニアリング部": 2.5, "インフラ部": 3.0}', '{"Senior Engineer": 2.0, "Lead": 2.5, "Architect": 3.0}', 300),
(1, 'Microsoft Azure Fundamentals', 'Azure基礎知識の証明', '🔵', 'beginner', 0.25, '{"エンジニアリング部": 1.8, "IT部": 2.0}', '{"Engineer": 1.5, "Junior": 2.0}', 100),

-- Security関連
(2, 'CompTIA Security+', 'ITセキュリティの基礎知識', '🛡️', 'intermediate', 0.18, '{"セキュリティ部": 3.0, "IT部": 2.0, "エンジニアリング部": 1.5}', '{"Security Engineer": 2.5, "Engineer": 1.8}', 220),
(2, 'CISSP', 'セキュリティ管理の最高峰資格', '👑', 'expert', 0.03, '{"セキュリティ部": 5.0, "IT部": 2.0}', '{"Senior Engineer": 2.0, "Lead": 3.0, "Manager": 2.5}', 500),
(2, 'CEH (Certified Ethical Hacker)', 'エシカルハッキングスキル', '🎭', 'advanced', 0.06, '{"セキュリティ部": 4.0, "エンジニアリング部": 1.8}', '{"Security Engineer": 3.0, "Senior Engineer": 2.0}', 350),

-- Project Management関連
(3, 'PMP (Project Management Professional)', 'プロジェクト管理の国際資格', '📋', 'advanced', 0.08, '{"プロジェクト管理部": 3.0, "開発部": 2.0, "営業部": 1.5}', '{"Manager": 3.0, "Lead": 2.5, "Senior": 2.0}', 280),
(3, 'Certified ScrumMaster', 'アジャイル開発の基礎', '🏃‍♂️', 'intermediate', 0.22, '{"開発部": 2.5, "エンジニアリング部": 2.0}', '{"Engineer": 2.0, "Lead": 2.2, "Manager": 1.8}', 150),
(3, 'ITIL Foundation', 'ITサービス管理の基礎', '📚', 'beginner', 0.30, '{"IT部": 2.0, "サポート部": 2.5, "エンジニアリング部": 1.5}', '{"Engineer": 1.8, "Support": 2.2}', 120),

-- Programming関連
(4, 'Oracle Certified Professional Java SE', 'Java開発の専門知識', '☕', 'advanced', 0.10, '{"開発部": 3.0, "エンジニアリング部": 2.5}', '{"Engineer": 2.5, "Senior Engineer": 2.0, "Lead": 1.8}', 250),
(4, 'Microsoft Certified: Azure Developer Associate', 'Azure開発者認定', '💻', 'intermediate', 0.14, '{"開発部": 2.5, "エンジニアリング部": 2.0}', '{"Engineer": 2.2, "Senior Engineer": 1.8}', 200),
(4, 'Python Institute PCAP', 'Python プログラミング能力認定', '🐍', 'intermediate', 0.18, '{"開発部": 2.2, "データサイエンス部": 2.8, "エンジニアリング部": 2.0}', '{"Engineer": 2.0, "Data Scientist": 2.5}', 180),

-- DevOps関連
(5, 'Docker Certified Associate', 'コンテナ技術の専門知識', '🐳', 'intermediate', 0.16, '{"エンジニアリング部": 2.5, "インフラ部": 3.0, "開発部": 2.0}', '{"Engineer": 2.3, "DevOps Engineer": 3.0}', 190),
(5, 'Certified Kubernetes Administrator', 'Kubernetes管理の専門知識', '⚙️', 'advanced', 0.06, '{"エンジニアリング部": 3.0, "インフラ部": 3.5}', '{"Senior Engineer": 2.5, "DevOps Engineer": 4.0, "Lead": 2.0}', 400),
(5, 'HashiCorp Certified: Terraform Associate', 'Infrastructure as Code', '🏗️', 'intermediate', 0.12, '{"インフラ部": 3.0, "エンジニアリング部": 2.0}', '{"DevOps Engineer": 3.0, "Infrastructure Engineer": 2.8}', 220),

-- Data関連
(6, 'Google Cloud Professional Data Engineer', 'データエンジニアリング専門知識', '📊', 'advanced', 0.07, '{"データサイエンス部": 3.5, "エンジニアリング部": 2.0}', '{"Data Engineer": 3.0, "Senior Engineer": 2.0, "Data Scientist": 2.5}', 320),
(6, 'AWS Certified Machine Learning', 'AWS機械学習サービス活用', '🤖', 'advanced', 0.05, '{"データサイエンス部": 4.0, "AI研究部": 4.5}', '{"Data Scientist": 3.5, "ML Engineer": 4.0}', 380),
(6, 'Tableau Desktop Specialist', 'データ可視化スキル', '📈', 'beginner', 0.20, '{"データサイエンス部": 2.5, "営業部": 2.0, "マーケティング部": 2.2}', '{"Analyst": 2.5, "Data Scientist": 2.0}', 130),

-- Architecture関連
(7, 'TOGAF Certified', 'エンタープライズアーキテクチャ', '🏛️', 'expert', 0.04, '{"アーキテクチャ部": 4.0, "エンジニアリング部": 2.0}', '{"Architect": 4.0, "Senior Engineer": 2.5, "Lead": 3.0}', 450),
(7, 'AWS Certified Solutions Architect - Professional', 'AWS上級アーキテクト認定', '🏆', 'expert', 0.03, '{"エンジニアリング部": 3.0, "アーキテクチャ部": 4.0}', '{"Architect": 3.5, "Senior Engineer": 2.8, "Lead": 3.2}', 500),

-- General IT関連
(8, 'CompTIA Network+', 'ネットワーク基礎知識', '🌐', 'beginner', 0.28, '{"IT部": 2.0, "インフラ部": 2.5, "エンジニアリング部": 1.8}', '{"Engineer": 1.8, "Network Engineer": 2.5}', 110),
(8, 'CompTIA A+', 'PC・ハードウェア基礎', '🖥️', 'beginner', 0.35, '{"サポート部": 3.0, "IT部": 2.5}', '{"Support": 2.8, "Junior": 2.5}', 90);

-- ビュー作成: バッジ統計
CREATE VIEW IF NOT EXISTS badge_stats AS
SELECT 
    b.id,
    b.name,
    bc.name as category_name,
    b.difficulty,
    b.points,
    COUNT(ub.id) as earned_count,
    ROUND(AVG(CASE WHEN ub.earned_at > datetime('now', '-30 days') THEN 1.0 ELSE 0.0 END) * 100, 2) as recent_activity_rate
FROM badges b
LEFT JOIN badge_categories bc ON b.category_id = bc.id
LEFT JOIN user_badges ub ON b.id = ub.badge_id
WHERE b.is_active = 1
GROUP BY b.id, b.name, bc.name, b.difficulty, b.points;

-- ビュー作成: ユーザーサマリー
CREATE VIEW IF NOT EXISTS user_summary AS
SELECT 
    e.employee_id,
    e.name,
    e.email,
    e.department,
    e.team,
    e.position,
    COUNT(ub.id) as total_badges,
    SUM(b.points) as total_points,
    COUNT(CASE WHEN ub.earned_at > datetime('now', '-30 days') THEN 1 END) as recent_badges
FROM employees e
LEFT JOIN user_badges ub ON e.employee_id = ub.employee_id
LEFT JOIN badges b ON ub.badge_id = b.id
GROUP BY e.employee_id, e.name, e.email, e.department, e.team, e.position;