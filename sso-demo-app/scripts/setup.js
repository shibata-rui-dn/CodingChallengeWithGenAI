#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import BadgeManager from '../database/badges.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🏆 バッジ管理システム セットアップ開始');

// 設定
const EMPLOYEE_DATA_PATH = path.resolve(__dirname, '../../sso-auth-system/data/employee.json');
const DB_PATH = path.join(__dirname, '../database/badge_demo.db');
const SCHEMA_PATH = path.join(__dirname, '../database/schema.sql');

// セットアップ関数
async function setupBadgeSystem() {
  try {
    // 1. データベース初期化
    console.log('📊 データベース初期化中...');
    await initializeDatabase();
    
    // 2. 従業員データ読み込み
    console.log('👥 従業員データ読み込み中...');
    const employees = await loadEmployeeData();
    
    // 3. 従業員データをデータベースに保存
    console.log('💾 従業員データ保存中...');
    await saveEmployeesToDatabase(employees);
    
    // 4. ランダムバッジ付与
    console.log('🎯 ランダムバッジ付与中...');
    const badgeStats = await assignRandomBadges(employees);
    
    // 5. セットアップ完了レポート
    console.log('📈 セットアップ完了レポート生成中...');
    await generateSetupReport(employees, badgeStats);
    
    console.log('✅ セットアップ完了!');
    
  } catch (error) {
    console.error('❌ セットアップエラー:', error.message);
    process.exit(1);
  }
}

// データベース初期化
async function initializeDatabase() {
  // 既存のデータベースファイルを削除
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('   既存のデータベースを削除しました');
  }

  // データベースディレクトリ作成
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // スキーマ読み込み
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  
  // データベース作成とスキーマ適用
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(schema);
  db.close();
  
  console.log('   データベースとテーブルを作成しました');
}

// 従業員データ読み込み
async function loadEmployeeData() {
  if (!fs.existsSync(EMPLOYEE_DATA_PATH)) {
    throw new Error(`従業員データファイルが見つかりません: ${EMPLOYEE_DATA_PATH}`);
  }

  const data = JSON.parse(fs.readFileSync(EMPLOYEE_DATA_PATH, 'utf8'));
  
  if (!data.employees || !Array.isArray(data.employees)) {
    throw new Error('従業員データの形式が正しくありません');
  }

  console.log(`   ${data.employees.length}名の従業員データを読み込みました`);
  console.log(`   会社: ${data.metadata.company}`);
  console.log(`   生成日時: ${data.metadata.generatedAt}`);
  
  return data.employees;
}

// 従業員データをデータベースに保存
async function saveEmployeesToDatabase(employees) {
  const badgeManager = new BadgeManager(DB_PATH);
  
  const insertStmt = badgeManager.db.prepare(`
    INSERT INTO employees (employee_id, name, email, department, team, position, role, supervisor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let savedCount = 0;
  let skippedCount = 0;
  let updatedCount = 0;

  for (const employee of employees) {
    try {
      // メールアドレスベースの認証に対応するため、employee_idとしてemailを使用
      const employeeId = employee.email || employee.employeeId;
      
      // 既存の従業員をチェック
      const existingEmployee = badgeManager.db.prepare('SELECT employee_id FROM employees WHERE employee_id = ? OR email = ?').get(employeeId, employee.email);
      
      if (existingEmployee) {
        // 既存の従業員の場合、必要に応じて更新
        if (existingEmployee.employee_id !== employeeId) {
          // employee_idをemailに更新
          const updateStmt = badgeManager.db.prepare(`
            UPDATE employees 
            SET employee_id = ?, name = ?, department = ?, team = ?, position = ?, role = ?, supervisor = ?
            WHERE employee_id = ? OR email = ?
          `);
          updateStmt.run(
            employeeId,
            employee.name,
            employee.department || 'Unknown',
            employee.team || 'Unknown',
            employee.position || 'Employee',
            employee.role || 'Employee',
            employee.supervisor || null,
            existingEmployee.employee_id,
            employee.email
          );
          
          // user_badgesテーブルも更新
          const updateBadgesStmt = badgeManager.db.prepare('UPDATE user_badges SET employee_id = ? WHERE employee_id = ?');
          updateBadgesStmt.run(employeeId, existingEmployee.employee_id);
          
          updatedCount++;
          console.log(`   更新: ${employee.name} (${existingEmployee.employee_id} → ${employeeId})`);
        } else {
          skippedCount++;
        }
      } else {
        // 新規従業員を追加
        insertStmt.run(
          employeeId,
          employee.name,
          employee.email,
          employee.department || 'Unknown',
          employee.team || 'Unknown',
          employee.position || 'Employee',
          employee.role || 'Employee',
          employee.supervisor || null
        );
        savedCount++;
      }
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        skippedCount++;
      } else {
        console.error(`   従業員保存エラー (${employee.name}):`, error.message);
      }
    }
  }

  badgeManager.close();
  
  console.log(`   保存: ${savedCount}名, 更新: ${updatedCount}名, スキップ: ${skippedCount}名`);
}

// ランダムバッジ付与
async function assignRandomBadges(employees) {
  const badgeManager = new BadgeManager(DB_PATH);
  
  const stats = {
    totalEmployees: employees.length,
    totalBadgesAwarded: 0,
    employeesWithBadges: 0,
    departmentStats: {},
    badgeStats: {},
    averageBadgesPerEmployee: 0
  };

  let processedCount = 0;
  
  for (const employee of employees) {
    // プロパティ名を変換してbadgeManagerに渡す
    // メールアドレスベースのemployee_idを使用
    const employeeId = employee.email || employee.employeeId;
    
    const employeeForBadge = {
      employee_id: employeeId,  // メールアドレスを使用
      name: employee.name,
      department: employee.department || 'Unknown',
      team: employee.team || 'Unknown',
      role: employee.role || 'Employee',
      position: employee.position || 'Employee'
    };
    
    const assignedBadges = badgeManager.assignRandomBadges(employeeForBadge);
    
    if (assignedBadges.length > 0) {
      stats.employeesWithBadges++;
      stats.totalBadgesAwarded += assignedBadges.length;
      
      // 部署別統計
      const dept = employee.department || 'Unknown';
      if (!stats.departmentStats[dept]) {
        stats.departmentStats[dept] = {
          employees: 0,
          badges: 0,
          averageBadges: 0
        };
      }
      stats.departmentStats[dept].employees++;
      stats.departmentStats[dept].badges += assignedBadges.length;
      
      // バッジ別統計
      assignedBadges.forEach(badge => {
        if (!stats.badgeStats[badge.badgeName]) {
          stats.badgeStats[badge.badgeName] = 0;
        }
        stats.badgeStats[badge.badgeName]++;
      });
    }
    
    processedCount++;
    if (processedCount % 100 === 0) {
      console.log(`   進捗: ${processedCount}/${employees.length} (${Math.round(processedCount/employees.length*100)}%)`);
    }
  }

  // 平均値計算
  stats.averageBadgesPerEmployee = stats.totalBadgesAwarded / stats.totalEmployees;
  
  Object.keys(stats.departmentStats).forEach(dept => {
    const deptStats = stats.departmentStats[dept];
    deptStats.averageBadges = deptStats.badges / deptStats.employees;
  });

  badgeManager.close();
  
  console.log(`   ${stats.totalBadgesAwarded}個のバッジを${stats.employeesWithBadges}名に付与しました`);
  
  return stats;
}

// セットアップレポート生成
async function generateSetupReport(employees, badgeStats) {
  const badgeManager = new BadgeManager(DB_PATH);
  const systemStats = badgeManager.getSystemStats();
  const departmentBadgeStats = badgeManager.getDepartmentBadgeStats();
  const badgeRankings = badgeManager.getBadgeRankings(10);
  
  const report = {
    setupTime: new Date().toISOString(),
    migration: {
      employeeIdFormat: 'email-based',
      description: 'employee_idをメールアドレスベースに統一しました'
    },
    summary: {
      totalEmployees: employees.length,
      totalBadgesAwarded: badgeStats.totalBadgesAwarded,
      averageBadgesPerEmployee: badgeStats.averageBadgesPerEmployee.toFixed(2),
      employeesWithBadges: badgeStats.employeesWithBadges,
      badgeParticipationRate: (badgeStats.employeesWithBadges / employees.length * 100).toFixed(1) + '%'
    },
    systemStats,
    departmentStats: departmentBadgeStats,
    topBadges: badgeRankings,
    badgeDistribution: Object.entries(badgeStats.badgeStats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 15)
      .map(([name, count]) => ({ name, count }))
  };
  
  // コンソール出力
  console.log('\n📊 === セットアップ レポート ===');
  console.log(`🔧 Employee ID形式: ${report.migration.employeeIdFormat}`);
  console.log(`🏢 従業員総数: ${report.summary.totalEmployees}名`);
  console.log(`🏅 付与バッジ総数: ${report.summary.totalBadgesAwarded}個`);
  console.log(`📈 平均バッジ数/人: ${report.summary.averageBadgesPerEmployee}個`);
  console.log(`👥 バッジ取得者: ${report.summary.employeesWithBadges}名 (${report.summary.badgeParticipationRate})`);
  
  console.log('\n🏆 人気バッジ TOP 5:');
  report.topBadges.slice(0, 5).forEach((badge, index) => {
    console.log(`  ${index + 1}. ${badge.name} - ${badge.earned_count}名取得`);
  });
  
  console.log('\n🏢 部署別統計 TOP 5:');
  departmentBadgeStats
    .sort((a, b) => b.total_points - a.total_points)
    .slice(0, 5)
    .forEach((dept, index) => {
      console.log(`  ${index + 1}. ${dept.department}: ${dept.total_badges}バッジ (${dept.total_points}pt)`);
    });
  
  badgeManager.close();
}

// 既存データの移行（オプション）
async function migrateExistingData() {
  console.log('🔄 既存データの移行中...');
  
  const badgeManager = new BadgeManager(DB_PATH);
  
  try {
    // 既存の従業員データでemail != employee_idの場合を移行
    const stmt = badgeManager.db.prepare(`
      SELECT employee_id, email FROM employees 
      WHERE employee_id != email AND email IS NOT NULL AND email != ''
    `);
    
    const employeesToMigrate = stmt.all();
    
    if (employeesToMigrate.length > 0) {
      console.log(`   ${employeesToMigrate.length}名の従業員IDを移行します`);
      
      for (const emp of employeesToMigrate) {
        // user_badgesテーブルを更新
        const updateBadgesStmt = badgeManager.db.prepare('UPDATE user_badges SET employee_id = ? WHERE employee_id = ?');
        const badgeResult = updateBadgesStmt.run(emp.email, emp.employee_id);
        
        // employeesテーブルを更新
        const updateEmpStmt = badgeManager.db.prepare('UPDATE employees SET employee_id = ? WHERE employee_id = ?');
        updateEmpStmt.run(emp.email, emp.employee_id);
        
        console.log(`     移行: ${emp.employee_id} → ${emp.email} (バッジ: ${badgeResult.changes}個)`);
      }
    } else {
      console.log('   移行が必要なデータはありません');
    }
  } catch (error) {
    console.error('   移行エラー:', error.message);
  } finally {
    badgeManager.close();
  }
}

// ヘルプ表示
function showHelp() {
  console.log(`
🏆 バッジ管理システム セットアップスクリプト (メールアドレス対応版)

使用方法:
  npm run setup                    # 完全セットアップ実行
  node scripts/setup.js            # 直接実行
  node scripts/setup.js --help     # ヘルプ表示
  node scripts/setup.js --check    # 設定確認のみ
  node scripts/setup.js --migrate  # 既存データの移行のみ

前提条件:
  - SSO認証システムの従業員データ (../sso-auth-system/data/employee.json)
  - Node.js 18+ 環境

変更点:
  - employee_idをメールアドレスベースに統一
  - SSOのメールアドレス認証と整合性を確保
  - 既存データの自動移行機能

注意:
  - 既存のデータベースは削除されます（--migrateオプション除く）
  - セットアップには数分かかる場合があります
  - 大量の従業員データがある場合は処理時間が増加します
`);
}

// 設定確認
function checkConfiguration() {
  console.log('🔍 設定確認中...');
  
  const checks = [
    {
      name: '従業員データファイル',
      path: EMPLOYEE_DATA_PATH,
      exists: fs.existsSync(EMPLOYEE_DATA_PATH)
    },
    {
      name: 'スキーマファイル',
      path: SCHEMA_PATH,
      exists: fs.existsSync(SCHEMA_PATH)
    },
    {
      name: 'データベースディレクトリ',
      path: path.dirname(DB_PATH),
      exists: fs.existsSync(path.dirname(DB_PATH))
    }
  ];

  let allGood = true;
  checks.forEach(check => {
    const status = check.exists ? '✅' : '❌';
    console.log(`${status} ${check.name}: ${check.path}`);
    if (!check.exists) allGood = false;
  });

  if (allGood) {
    console.log('\n✅ すべての前提条件が満たされています');
  } else {
    console.log('\n❌ 不足している前提条件があります');
    process.exit(1);
  }
}

// メイン実行
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  showHelp();
} else if (args.includes('--check')) {
  checkConfiguration();
} else if (args.includes('--migrate')) {
  migrateExistingData();
} else {
  setupBadgeSystem();
}