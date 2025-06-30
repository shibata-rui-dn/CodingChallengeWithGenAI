import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const organizationStructure = {
    "経営陣": {
        teams: ["CEO Office"],
        positions: [
            { title: "CEO", level: 1, maxCount: 1 },
            { title: "CTO", level: 2, maxCount: 1 },
            { title: "CPO", level: 2, maxCount: 1 },
            { title: "CFO", level: 2, maxCount: 1 },
            { title: "CHRO", level: 2, maxCount: 1 }
        ]
    },
    "開発部": {
        teams: ["フロントエンド", "バックエンド", "インフラ", "モバイル", "AI・ML", "QA"],
        positions: [
            { title: "部長", level: 3, maxCount: 1 },
            { title: "チームリーダー", level: 4, maxCount: 6 },
            { title: "シニアエンジニア", level: 5, maxCount: 90 },
            { title: "エンジニア", level: 6, maxCount: 240 },
            { title: "ジュニアエンジニア", level: 7, maxCount: 150 }
        ]
    },
    "プロダクト部": {
        teams: ["プロダクトマネジメント", "UI/UX", "データアナリスト"],
        positions: [
            { title: "部長", level: 3, maxCount: 1 },
            { title: "チームリーダー", level: 4, maxCount: 3 },
            { title: "シニアスペシャリスト", level: 5, maxCount: 24 },
            { title: "スペシャリスト", level: 6, maxCount: 48 },
            { title: "アソシエイト", level: 7, maxCount: 32 }
        ]
    },
    "営業部": {
        teams: ["エンタープライズ", "SMB", "パートナー"],
        positions: [
            { title: "部長", level: 3, maxCount: 1 },
            { title: "マネージャー", level: 4, maxCount: 3 },
            { title: "シニアセールス", level: 5, maxCount: 30 },
            { title: "セールス", level: 6, maxCount: 60 },
            { title: "セールスアソシエイト", level: 7, maxCount: 40 }
        ]
    },
    "マーケティング部": {
        teams: ["デジタルマーケティング", "コンテンツ", "イベント"],
        positions: [
            { title: "部長", level: 3, maxCount: 1 },
            { title: "マネージャー", level: 4, maxCount: 3 },
            { title: "シニアマーケター", level: 5, maxCount: 18 },
            { title: "マーケター", level: 6, maxCount: 36 },
            { title: "アシスタント", level: 7, maxCount: 24 }
        ]
    },
    "人事部": {
        teams: ["採用", "労務", "人事企画"],
        positions: [
            { title: "部長", level: 3, maxCount: 1 },
            { title: "マネージャー", level: 4, maxCount: 3 },
            { title: "シニアスペシャリスト", level: 5, maxCount: 15 },
            { title: "スペシャリスト", level: 6, maxCount: 30 },
            { title: "アソシエイト", level: 7, maxCount: 20 }
        ]
    },
    "総務・経理部": {
        teams: ["総務", "経理", "法務"],
        positions: [
            { title: "部長", level: 3, maxCount: 1 },
            { title: "マネージャー", level: 4, maxCount: 3 },
            { title: "シニアスペシャリスト", level: 5, maxCount: 18 },
            { title: "スペシャリスト", level: 6, maxCount: 36 },
            { title: "アソシエイト", level: 7, maxCount: 24 }
        ]
    },
    "カスタマーサクセス部": {
        teams: ["サポート", "オンボーディング", "アカウントマネジメント"],
        positions: [
            { title: "部長", level: 3, maxCount: 1 },
            { title: "マネージャー", level: 4, maxCount: 3 },
            { title: "シニアスペシャリスト", level: 5, maxCount: 24 },
            { title: "スペシャリスト", level: 6, maxCount: 48 },
            { title: "アソシエイト", level: 7, maxCount: 36 }
        ]
    }
};

const surnames = [
    "田中", "佐藤", "鈴木", "高橋", "渡辺", "伊藤", "中村", "小林", "加藤", "吉田",
    "山田", "佐々木", "山口", "松本", "井上", "木村", "林", "清水", "山崎", "池田",
    "橋本", "阿部", "石川", "山本", "森", "近藤", "斎藤", "坂本", "前田", "藤田",
    "後藤", "岡田", "長谷川", "村上", "石田", "原", "小川", "竹内", "中島", "金子",
    "藤井", "西村", "福田", "三浦", "藤原", "太田", "松田", "岡本", "中川", "中野",
    "河野", "安田", "柴田", "宮崎", "酒井", "工藤", "横山", "宮本", "内田", "高木",
    "安藤", "島田", "谷口", "大野", "高田", "丸山", "今井", "河合", "武田", "上田",
    "杉山", "千葉", "村田", "増田", "小野", "田村", "原田", "服部", "野口", "古川",
    "関", "青木", "菊地", "久保", "遠藤", "菅原", "大塚", "北村", "水野", "尾崎",
    "土屋", "樋口", "望月", "新井", "石井", "中田", "東", "松井", "秋山", "上野"
];

const givenNames = {
    male: [
        "太郎", "次郎", "三郎", "健", "誠", "学", "明", "博", "和彦", "裕介",
        "大輔", "雄一", "隆", "浩", "勇", "智", "淳", "薫", "聡", "正",
        "亮", "翔", "駿", "蓮", "樹", "悠", "翼", "陸", "海", "空",
        "拓也", "雅人", "直樹", "康弘", "秀樹", "豊", "茂", "克己", "昭", "進",
        "秀", "純", "光", "功", "実", "修", "武", "忠", "勝", "哲",
        "信", "治", "清", "良", "一", "二", "三", "四", "五", "六",
        "達也", "慎一", "貴志", "和也", "英樹", "康介", "優", "涼", "湊", "新",
        "颯", "朝陽", "晴", "奏", "陽太", "悠真", "悠人", "颯太", "陽向", "蒼"
    ],
    female: [
        "花子", "恵子", "美和", "由美", "真理", "香織", "美香", "愛", "麻衣", "瞳",
        "さくら", "美穂", "彩", "絵美", "理恵", "智子", "優子", "千尋", "夏美", "春香",
        "美咲", "あゆみ", "みなみ", "ひなた", "結衣", "美月", "葵", "詩織", "舞", "栞",
        "七海", "莉子", "美優", "凛", "心", "陽菜", "結愛", "咲良", "美羽", "琴音",
        "幸", "恵", "みき", "みゆき", "みどり", "ゆかり", "あき", "あきこ", "みのり", "かおり",
        "ひろみ", "なおみ", "さとみ", "みほ", "きよみ", "とも", "ともこ", "みさき", "りえ", "まい",
        "みお", "りお", "あお", "ももか", "ひまり", "あかり", "ひな", "さな", "えま", "みく",
        "さくらこ", "りこ", "ももこ", "ひかり", "みらい", "つばき", "いろは", "あんな", "えみ", "なな"
    ]
};

const kanjiToRomaji = {
    "田中": "tanaka", "佐藤": "sato", "鈴木": "suzuki", "高橋": "takahashi", "渡辺": "watanabe",
    "伊藤": "ito", "中村": "nakamura", "小林": "kobayashi", "加藤": "kato", "吉田": "yoshida",
    "山田": "yamada", "佐々木": "sasaki", "山口": "yamaguchi", "松本": "matsumoto", "井上": "inoue",
    "木村": "kimura", "林": "hayashi", "清水": "shimizu", "山崎": "yamazaki", "池田": "ikeda",
    "橋本": "hashimoto", "阿部": "abe", "石川": "ishikawa", "山本": "yamamoto", "森": "mori",
    "近藤": "kondo", "斎藤": "saito", "坂本": "sakamoto", "前田": "maeda", "藤田": "fujita",
    "後藤": "goto", "岡田": "okada", "長谷川": "hasegawa", "村上": "murakami", "石田": "ishida",
    "原": "hara", "小川": "ogawa", "竹内": "takeuchi", "中島": "nakajima", "金子": "kaneko",
    "藤井": "fujii", "西村": "nishimura", "福田": "fukuda", "三浦": "miura", "藤原": "fujiwara",
    "太田": "ota", "松田": "matsuda", "岡本": "okamoto", "中川": "nakagawa", "中野": "nakano",
    "河野": "kono", "安田": "yasuda", "柴田": "shibata", "宮崎": "miyazaki", "酒井": "sakai",
    "工藤": "kudo", "横山": "yokoyama", "宮本": "miyamoto", "内田": "uchida", "高木": "takagi",
    "安藤": "ando", "島田": "shimada", "谷口": "taniguchi", "大野": "ono", "高田": "takada",
    "太郎": "taro", "次郎": "jiro", "三郎": "saburo", "健": "ken", "誠": "makoto",
    "学": "manabu", "明": "akira", "博": "hiroshi", "和彦": "kazuhiko", "裕介": "yusuke",
    "大輔": "daisuke", "雄一": "yuichi", "隆": "takashi", "浩": "hiroshi", "勇": "yu",
    "智": "satoshi", "淳": "jun", "薫": "kaoru", "聡": "satoshi", "正": "tadashi",
    "亮": "ryo", "翔": "sho", "駿": "shun", "蓮": "ren", "樹": "itsuki",
    "悠": "yu", "翼": "tsubasa", "陸": "riku", "海": "kai", "空": "sora",
    "拓也": "takuya", "雅人": "masato", "直樹": "naoki", "康弘": "yasuhiro", "秀樹": "hideki",
    "豊": "yutaka", "茂": "shigeru", "克己": "katsumi", "昭": "akira", "進": "susumu",
    "花子": "hanako", "恵子": "keiko", "美和": "miwa", "由美": "yumi", "真理": "mari",
    "香織": "kaori", "美香": "mika", "愛": "ai", "麻衣": "mai", "瞳": "hitomi",
    "さくら": "sakura", "美穂": "miho", "彩": "aya", "絵美": "emi", "理恵": "rie",
    "智子": "tomoko", "優子": "yuko", "千尋": "chihiro", "夏美": "natsumi", "春香": "haruka",
    "美咲": "misaki", "あゆみ": "ayumi", "みなみ": "minami", "ひなた": "hinata", "結衣": "yui",
    "美月": "mitsuki", "葵": "aoi", "詩織": "shiori", "舞": "mai", "栞": "shiori",
    "七海": "nanami", "莉子": "riko", "美優": "miyu", "凛": "rin", "心": "kokoro",
    "陽菜": "hina", "結愛": "yua", "咲良": "sakura", "美羽": "miu", "琴音": "kotone"
};

const usedEmails = new Set();
const usedIds = new Set();

function generateEmail(surname, givenName, employeeId) {
    const surnameRomaji = kanjiToRomaji[surname] || generateRandomString(4, 6);
    const givenNameRomaji = kanjiToRomaji[givenName] || generateRandomString(3, 5);

    const baseEmail = `${surnameRomaji}.${givenNameRomaji}`;
    let email = `${baseEmail}@kk.co.com`;

    let counter = 1;
    while (usedEmails.has(email)) {
        email = `${baseEmail}${counter}@kk.co.com`;
        counter++;
    }

    usedEmails.add(email);
    return email;
}

function generateRandomString(minLength, maxLength) {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateEmployeeId() {
    let id;
    do {
        id = `KK${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;
    } while (usedIds.has(id));

    usedIds.add(id);
    return id;
}

function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function generateEmployees() {
    const employees = [];

    // 1. 経営陣を最初に生成
    const executivePositions = organizationStructure["経営陣"].positions;
    executivePositions.forEach(position => {
        for (let i = 0; i < position.maxCount; i++) {
            const executive = generateEmployee("経営陣", "CEO Office", position.title, position.level);

            if (position.title === 'CEO') {
                executive.supervisor = null;
            } else {
                const ceo = employees.find(emp => emp.position === 'CEO');
                executive.supervisor = ceo ? ceo.email : null;
            }

            employees.push(executive);
        }
    });

    // 2. 他の部署を生成
    Object.entries(organizationStructure).forEach(([department, config]) => {
        if (department === "経営陣") return;

        // 部長を生成
        const deptHeadPosition = config.positions.find(p => p.level === 3);
        if (deptHeadPosition) {
            const deptHead = generateEmployee(department, config.teams[0], deptHeadPosition.title, 3);

            const executives = employees.filter(emp => emp.department === "経営陣" && emp.level === 2);
            if (executives.length > 0) {
                deptHead.supervisor = getRandomItem(executives).email;
            }
            employees.push(deptHead);
        }

        // チームリーダー/マネージャーを各チームに1人ずつ配置
        const managerPosition = config.positions.find(p => p.level === 4);
        if (managerPosition) {
            config.teams.forEach(team => {
                const teamLeader = generateEmployee(department, team, managerPosition.title, 4);

                const deptHead = employees.find(emp => emp.department === department && emp.level === 3);
                teamLeader.supervisor = deptHead ? deptHead.email : null;

                employees.push(teamLeader);
            });
        }

        // その他の職位をチームに分散配置
        config.positions.filter(p => p.level > 4).forEach(position => {
            const countPerTeam = Math.floor(position.maxCount / config.teams.length);
            const remainder = position.maxCount % config.teams.length;

            config.teams.forEach((team, teamIndex) => {
                let countForThisTeam = countPerTeam;
                if (teamIndex < remainder) {
                    countForThisTeam++;
                }

                for (let i = 0; i < countForThisTeam; i++) {
                    const employee = generateEmployee(department, team, position.title, position.level);

                    const teamLeader = employees.find(emp =>
                        emp.department === department &&
                        emp.team === team &&
                        emp.level === 4
                    );

                    employee.supervisor = teamLeader ? teamLeader.email : null;

                    employees.push(employee);
                }
            });
        });
    });

    // 管理職で部下がいない場合は部下を追加
    const managerPositions = ['CEO', 'CTO', 'CPO', 'CFO', 'CHRO', '部長', 'チームリーダー', 'マネージャー'];
    const managers = employees.filter(emp => managerPositions.includes(emp.position));

    managers.forEach(manager => {
        const subordinates = employees.filter(emp => emp.supervisor === manager.email);
        if (subordinates.length === 0 && manager.position !== 'CEO') {
            const subordinate = generateEmployee(
                manager.department,
                manager.team,
                getAppropriateSubordinatePosition(manager.department),
                7
            );
            subordinate.supervisor = manager.email;
            employees.push(subordinate);
        }
    });

    return employees.map(emp => {
        const { level, ...finalEmployee } = emp;
        return finalEmployee;
    });
}

function getAppropriateSubordinatePosition(department) {
    const positionMap = {
        "経営陣": "アシスタント",
        "開発部": "ジュニアエンジニア",
        "プロダクト部": "アソシエイト",
        "営業部": "セールスアソシエイト",
        "マーケティング部": "アシスタント",
        "人事部": "アソシエイト",
        "総務・経理部": "アソシエイト",
        "カスタマーサクセス部": "アソシエイト"
    };
    return positionMap[department] || "アソシエイト";
}

function generateEmployee(department, team, position, level) {
    const gender = Math.random() > 0.6 ? 'female' : 'male';
    const surname = getRandomItem(surnames);
    const givenName = getRandomItem(givenNames[gender]);
    const employeeId = generateEmployeeId();
    const email = generateEmail(surname, givenName, employeeId);

    return {
        employeeId: employeeId,
        name: `${surname} ${givenName}`,
        email: email,
        department: department,
        team: team,
        position: position,
        role: position,
        supervisor: null,
        level: level
    };
}

function validateEmployeeData(employees) {
    const validationResults = {
        isValid: true,
        errors: [],
        warnings: []
    };

    const emailSet = new Set();
    const idSet = new Set();
    const nameCountMap = new Map();

    employees.forEach(emp => {
        if (emailSet.has(emp.email)) {
            validationResults.errors.push(`重複メールアドレス: ${emp.email}`);
            validationResults.isValid = false;
        }
        emailSet.add(emp.email);

        if (idSet.has(emp.employeeId)) {
            validationResults.errors.push(`重複従業員ID: ${emp.employeeId}`);
            validationResults.isValid = false;
        }
        idSet.add(emp.employeeId);

        nameCountMap.set(emp.name, (nameCountMap.get(emp.name) || 0) + 1);
    });

    const duplicateNames = Array.from(nameCountMap.entries()).filter(([name, count]) => count > 1);
    if (duplicateNames.length > 0) {
        const totalDuplicates = duplicateNames.reduce((sum, [name, count]) => sum + count, 0);
        validationResults.warnings.push(`氏名重複: ${duplicateNames.length}組 (合計${totalDuplicates}人)`);
    }

    const ceos = employees.filter(emp => emp.position === 'CEO');
    if (ceos.length !== 1) {
        validationResults.errors.push(`CEOは1人である必要があります（現在: ${ceos.length}人）`);
        validationResults.isValid = false;
    } else if (ceos[0].supervisor !== null) {
        validationResults.errors.push(`CEOに上司が設定されています: ${ceos[0].supervisor}`);
        validationResults.isValid = false;
    }

    const nonCeoEmployees = employees.filter(emp => emp.position !== 'CEO');
    nonCeoEmployees.forEach(emp => {
        if (!emp.supervisor) {
            validationResults.errors.push(`${emp.name} (${emp.position}) に上司が設定されていません`);
            validationResults.isValid = false;
        } else {
            const supervisor = employees.find(s => s.email === emp.supervisor);
            if (!supervisor) {
                validationResults.errors.push(`${emp.name} の上司 ${emp.supervisor} が従業員リストに存在しません`);
                validationResults.isValid = false;
            }
        }
    });

    const deptStats = {};
    const teamStats = {};

    employees.forEach(emp => {
        if (!deptStats[emp.department]) {
            deptStats[emp.department] = 0;
        }
        deptStats[emp.department]++;

        const teamKey = `${emp.department}/${emp.team}`;
        if (!teamStats[teamKey]) {
            teamStats[teamKey] = 0;
        }
        teamStats[teamKey]++;
    });

    Object.entries(deptStats).forEach(([dept, count]) => {
        if (count < 2) {
            validationResults.errors.push(`部署 ${dept} の人数が不足しています（${count}人）`);
            validationResults.isValid = false;
        }
    });

    Object.entries(teamStats).forEach(([team, count]) => {
        if (count < 2) {
            validationResults.errors.push(`チーム ${team} の人数が不足しています（${count}人）`);
            validationResults.isValid = false;
        }
    });

    return validationResults;
}

function checkOrganizationStructure() {
    let output = "";
    
    let totalPlanned = 0;
    Object.values(organizationStructure).forEach(dept => {
        dept.positions.forEach(pos => {
            totalPlanned += pos.maxCount;
        });
    });
    
    output += `KK Company (${totalPlanned}人)\n`;
    
    const departments = Object.entries(organizationStructure);
    departments.forEach(([department, config], deptIndex) => {
        const isLastDept = deptIndex === departments.length - 1;
        const deptPrefix = isLastDept ? "└── " : "├── ";
        
        const deptTotal = config.positions.reduce((sum, pos) => sum + pos.maxCount, 0);
        output += `${deptPrefix}${department} (${deptTotal}人)\n`;
        
        config.teams.forEach((team, teamIndex) => {
            const isLastTeam = teamIndex === config.teams.length - 1;
            const teamPrefix = isLastDept ? "    " : "│   ";
            const teamBranch = isLastTeam ? "└── " : "├── ";
            
            let teamEmployees = [];
            
            config.positions.forEach(position => {
                let countForThisTeam = 0;
                
                if (position.level === 3) {
                    if (teamIndex === 0) {
                        countForThisTeam = position.maxCount;
                    }
                } else if (position.level === 4) {
                    countForThisTeam = 1;
                } else {
                    const countPerTeam = Math.floor(position.maxCount / config.teams.length);
                    const remainder = position.maxCount % config.teams.length;
                    countForThisTeam = countPerTeam;
                    if (teamIndex < remainder) {
                        countForThisTeam++;
                    }
                }
                
                if (countForThisTeam > 0) {
                    teamEmployees.push({
                        title: position.title,
                        count: countForThisTeam,
                        level: position.level
                    });
                }
            });
            
            const teamTotal = teamEmployees.reduce((sum, emp) => sum + emp.count, 0);
            output += `${teamPrefix}${teamBranch}${team} (${teamTotal}人)\n`;
            
            teamEmployees.forEach((emp, empIndex) => {
                const isLastEmp = empIndex === teamEmployees.length - 1;
                const empPrefix = isLastDept ? "    " : "│   ";
                const empSubPrefix = isLastTeam ? "    " : "│   ";
                const empBranch = isLastEmp ? "└── " : "├── ";
                
                output += `${teamPrefix}${empSubPrefix}${empBranch}${emp.title} (${emp.count}人)\n`;
            });
        });
        
        if (!isLastDept) {
            output += "│\n";
        }
    });
    
    return output;
}

function generateHierarchyTree(employees) {
    const ceo = employees.find(emp => emp.position === 'CEO');
    if (!ceo) {
        return "CEOが見つかりません";
    }

    let output = "";
    
    function buildTree(person, level = 0, isLast = true, parentPrefix = "") {
        const prefix = level === 0 ? "" : (isLast ? "└── " : "├── ");
        const indent = parentPrefix + (level > 0 ? (isLast ? "    " : "│   ") : "");
        
        const subordinates = employees.filter(emp => emp.supervisor === person.email);
        const subordinateCount = subordinates.length;
        
        output += `${parentPrefix}${prefix}${person.name} (${person.position}) - ${person.department}/${person.team}`;
        if (subordinateCount > 0) {
            output += ` [部下: ${subordinateCount}人]`;
        }
        output += "\n";
        
        subordinates.sort((a, b) => {
            if (a.department !== b.department) {
                return a.department.localeCompare(b.department);
            }
            if (a.position !== b.position) {
                return a.position.localeCompare(b.position);
            }
            return a.name.localeCompare(b.name);
        });
        
        subordinates.forEach((subordinate, index) => {
            const isLastSubordinate = index === subordinates.length - 1;
            buildTree(subordinate, level + 1, isLastSubordinate, indent);
        });
    }

    buildTree(ceo);
    return output;
}

function exportToMarkdown(employees, filename = 'organization_structure.md') {
    try {
        const outputDir = ensureOutputDirectory();
        const fullPath = path.join(outputDir, filename);

        let markdown = "";
        
        markdown += "# KK Company 組織構造レポート\n\n";
        markdown += `生成日時: ${new Date().toLocaleString('ja-JP')}\n`;
        markdown += `総従業員数: ${employees.length}人\n\n`;
        
        markdown += "## 1. 組織構造（計画）\n\n";
        markdown += "```\n";
        markdown += checkOrganizationStructure();
        markdown += "```\n\n";
        
        markdown += "## 2. 実際の上司-部下関係\n\n";
        markdown += "```\n";
        markdown += generateHierarchyTree(employees);
        markdown += "```\n\n";
        
        const stats = generateStatistics(employees);
        
        markdown += "## 3. 部署別統計\n\n";
        markdown += "| 部署 | 人数 |\n";
        markdown += "|------|------|\n";
        Object.entries(stats.departmentStats).forEach(([dept, count]) => {
            markdown += `| ${dept} | ${count} |\n`;
        });
        
        markdown += "\n## 4. 職位別統計\n\n";
        markdown += "| 職位 | 人数 |\n";
        markdown += "|------|------|\n";
        Object.entries(stats.positionStats).forEach(([position, count]) => {
            markdown += `| ${position} | ${count} |\n`;
        });
        
        markdown += "\n## 5. 管理職の部下数\n\n";
        markdown += "| 管理職 | 部下数 |\n";
        markdown += "|--------|--------|\n";
        Object.entries(stats.supervisorStats)
            .sort((a, b) => b[1] - a[1])
            .forEach(([supervisorEmail, count]) => {
                const manager = employees.find(emp => emp.email === supervisorEmail);
                const name = manager ? manager.name : '不明';
                const position = manager ? manager.position : '不明';
                markdown += `| ${name} (${position}) | ${count} |\n`;
            });
        
        markdown += "\n## 6. チーム別詳細\n\n";
        Object.entries(stats.teamStats).forEach(([team, count]) => {
            markdown += `### ${team}\n`;
            markdown += `人数: ${count}人\n\n`;
            
            const teamMembers = employees.filter(emp => `${emp.department}/${emp.team}` === team);
            const positionCounts = {};
            teamMembers.forEach(emp => {
                positionCounts[emp.position] = (positionCounts[emp.position] || 0) + 1;
            });
            
            markdown += "| 職位 | 人数 |\n";
            markdown += "|------|------|\n";
            Object.entries(positionCounts).forEach(([position, count]) => {
                markdown += `| ${position} | ${count} |\n`;
            });
            markdown += "\n";
        });

        fs.writeFileSync(fullPath, markdown, 'utf8');
        console.log(`組織構造レポートを保存しました: ${fullPath}`);
        console.log(`ファイルサイズ: ${(fs.statSync(fullPath).size / 1024).toFixed(2)} KB`);

        return {
            success: true,
            filename: filename,
            fullPath: fullPath,
            size: fs.statSync(fullPath).size
        };

    } catch (error) {
        console.error(`Markdownファイル保存エラー: ${error.message}`);
        return { success: false, error: error.message };
    }
}

function ensureOutputDirectory() {
    const outputDir = path.join(__dirname, 'data');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    return outputDir;
}

function exportToJSON(employees, filename = 'employee.json') {
    try {
        const outputDir = ensureOutputDirectory();
        const fullPath = path.join(outputDir, filename);

        const exportData = {
            metadata: {
                generatedAt: new Date().toISOString(),
                totalEmployees: employees.length,
                company: "KK Company",
                filename: filename,
                nodeVersion: process.version,
                platform: process.platform,
                moduleType: "ES Module"
            },
            employees: employees
        };

        const jsonString = JSON.stringify(exportData, null, 2);

        fs.writeFileSync(fullPath, jsonString, 'utf8');
        console.log(`JSONファイルを保存しました: ${fullPath}`);
        console.log(`ファイルサイズ: ${(fs.statSync(fullPath).size / 1024).toFixed(2)} KB`);

        return {
            success: true,
            filename: filename,
            fullPath: fullPath,
            size: fs.statSync(fullPath).size,
            data: exportData
        };

    } catch (error) {
        console.error(`JSONファイル保存エラー: ${error.message}`);
        return { success: false, error: error.message };
    }
}

function generateStatistics(employees) {
    const stats = {
        totalEmployees: employees.length,
        departmentStats: {},
        teamStats: {},
        positionStats: {},
        supervisorStats: {}
    };

    employees.forEach(emp => {
        if (!stats.departmentStats[emp.department]) {
            stats.departmentStats[emp.department] = 0;
        }
        stats.departmentStats[emp.department]++;

        const teamKey = `${emp.department}/${emp.team}`;
        if (!stats.teamStats[teamKey]) {
            stats.teamStats[teamKey] = 0;
        }
        stats.teamStats[teamKey]++;

        if (!stats.positionStats[emp.position]) {
            stats.positionStats[emp.position] = 0;
        }
        stats.positionStats[emp.position]++;

        if (emp.supervisor) {
            if (!stats.supervisorStats[emp.supervisor]) {
                stats.supervisorStats[emp.supervisor] = 0;
            }
            stats.supervisorStats[emp.supervisor]++;
        }
    });

    return stats;
}

export function main() {
    console.log("=== KK Company 従業員データ生成システム ===");

    const employees = generateEmployees();
    console.log(`生成完了: ${employees.length}人`);

    const validation = validateEmployeeData(employees);

    if (validation.isValid) {
        console.log("✅ すべての検証をパスしました");
    } else {
        console.log("❌ 検証エラーがあります");
        validation.errors.forEach(error => console.log(`  - エラー: ${error}`));
    }

    if (validation.warnings.length > 0) {
        validation.warnings.forEach(warning => console.log(`  - 警告: ${warning}`));
    }

    const stats = generateStatistics(employees);

    console.log("部署別人数:");
    Object.entries(stats.departmentStats).forEach(([dept, count]) => {
        console.log(`  ${dept}: ${count}人`);
    });

    const jsonResult = exportToJSON(employees);
    if (!jsonResult.success) {
        console.log("❌ JSONファイル保存に失敗しました");
        if (jsonResult.error) {
            console.log(`エラー: ${jsonResult.error}`);
        }
    }

    const markdownResult = exportToMarkdown(employees);
    if (!markdownResult.success) {
        console.log("❌ Markdownファイル保存に失敗しました");
        if (markdownResult.error) {
            console.log(`エラー: ${markdownResult.error}`);
        }
    }

    return {
        employees,
        validation,
        statistics: stats,
        files: {
            json: jsonResult,
            markdown: markdownResult
        },
        performance: {
            employeeCount: employees.length
        }
    };
}

export {
    generateEmployees,
    validateEmployeeData,
    generateStatistics,
    exportToJSON,
    exportToMarkdown,
    checkOrganizationStructure,
    generateHierarchyTree
};

main();