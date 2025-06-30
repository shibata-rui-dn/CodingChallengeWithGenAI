// 組織可視化システム - メインアプリケーション

class OrganizationViewer {
    constructor() {
        this.user = null;
        this.orgData = null;
        this.employees = {};
        
        this.initializeElements();
        this.bindEvents();
        this.checkAuthStatus();
    }

    // DOM要素の初期化
    initializeElements() {
        this.elements = {
            loading: document.getElementById('loading'),
            loginPage: document.getElementById('loginPage'),
            dashboard: document.getElementById('dashboard'),
            userInfo: document.getElementById('userInfo'),
            userName: document.getElementById('userName'),
            loginBtn: document.getElementById('loginBtn'),
            logoutBtn: document.getElementById('logoutBtn'),
            orgTree: document.getElementById('orgTree'),
            deptSelect: document.getElementById('deptSelect'),
            employeeList: document.getElementById('employeeList'),
            employeeModal: document.getElementById('employeeModal'),
            modalClose: document.getElementById('modalClose'),
            employeeDetail: document.getElementById('employeeDetail')
        };
    }

    // イベントバインディング
    bindEvents() {
        this.elements.loginBtn.addEventListener('click', () => this.login());
        this.elements.logoutBtn.addEventListener('click', () => this.logout());
        this.elements.modalClose.addEventListener('click', () => this.closeModal());
        this.elements.deptSelect.addEventListener('change', (e) => this.loadEmployees(e.target.value));
        
        // モーダル外クリックで閉じる
        this.elements.employeeModal.addEventListener('click', (e) => {
            if (e.target === this.elements.employeeModal) {
                this.closeModal();
            }
        });
    }

    // 認証状態確認
    async checkAuthStatus() {
        try {
            const response = await fetch('/api/auth/status');
            const data = await response.json();

            if (data.authenticated) {
                this.user = data.user;
                await this.showDashboard();
            } else {
                this.showLogin();
            }
        } catch (error) {
            console.error('認証状態確認エラー:', error);
            this.showLogin();
        }
    }

    // ログイン
    login() {
        window.location.href = '/oauth/login';
    }

    // ログアウト
    async logout() {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.reload();
        } catch (error) {
            console.error('ログアウトエラー:', error);
        }
    }

    // ログイン画面表示
    showLogin() {
        this.elements.loading.style.display = 'none';
        this.elements.loginPage.style.display = 'flex';
        this.elements.dashboard.style.display = 'none';
        this.elements.userInfo.style.display = 'none';
    }

    // ダッシュボード表示
    async showDashboard() {
        this.elements.loading.style.display = 'flex';
        this.elements.loginPage.style.display = 'none';
        
        // ユーザー情報表示
        this.elements.userName.textContent = this.user.name || this.user.preferred_username;
        this.elements.userInfo.style.display = 'flex';

        try {
            // 組織データ取得
            await this.loadOrganizationData();
            
            this.elements.loading.style.display = 'none';
            this.elements.dashboard.style.display = 'block';
        } catch (error) {
            console.error('ダッシュボード読み込みエラー:', error);
            this.showError('データの読み込みに失敗しました');
        }
    }

    // 組織データ取得
    async loadOrganizationData() {
        const response = await fetch('/api/organization');
        if (!response.ok) throw new Error('組織データ取得失敗');
        
        this.orgData = await response.json();
        this.renderOrganizationTree();
        this.setupDepartmentSelector();
    }

    // 組織ツリー描画
    renderOrganizationTree() {
        const tree = this.orgData.structure;
        let html = '';

        for (const [company, departments] of Object.entries(tree)) {
            html += `<div class="org-node">`;
            html += `<div class="org-company">${company}</div>`;
            
            for (const [dept, teams] of Object.entries(departments)) {
                html += `<div class="org-department" data-dept="${dept}" onclick="orgViewer.selectDepartment('${dept}')">`;
                html += `<i class="fas fa-building"></i> ${dept}`;
                html += `</div>`;
                
                if (teams && teams.length > 0) {
                    teams.forEach(team => {
                        html += `<div class="org-team"><i class="fas fa-users"></i> ${team}</div>`;
                    });
                }
            }
            html += `</div>`;
        }

        this.elements.orgTree.innerHTML = html;
    }

    // 部署セレクター設定
    setupDepartmentSelector() {
        const departments = this.orgData.departments.map(dept => dept.department);
        const uniqueDepartments = [...new Set(departments)];
        
        let html = '<option value="">部署を選択してください</option>';
        uniqueDepartments.forEach(dept => {
            html += `<option value="${dept}">${dept}</option>`;
        });
        
        this.elements.deptSelect.innerHTML = html;
    }

    // 部署選択
    selectDepartment(department) {
        this.elements.deptSelect.value = department;
        this.loadEmployees(department);
    }

    // 従業員データ取得
    async loadEmployees(department) {
        if (!department) {
            this.elements.employeeList.innerHTML = '<p class="text-muted">部署を選択してください</p>';
            return;
        }

        try {
            this.elements.employeeList.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';
            
            const response = await fetch(`/api/employees/${encodeURIComponent(department)}`);
            if (!response.ok) throw new Error('従業員データ取得失敗');
            
            const data = await response.json();
            this.employees[department] = data.employees;
            this.renderEmployeeList(data.employees);
        } catch (error) {
            console.error('従業員データ取得エラー:', error);
            this.elements.employeeList.innerHTML = '<p class="text-muted">従業員データの取得に失敗しました</p>';
        }
    }

    // 従業員リスト描画
    renderEmployeeList(employees) {
        if (!employees || employees.length === 0) {
            this.elements.employeeList.innerHTML = '<p class="text-muted">この部署には従業員がいません</p>';
            return;
        }

        let html = '';
        employees.forEach(emp => {
            const badgeCount = emp.badge_count || 0;
            const totalPoints = emp.total_points || 0;
            
            html += `
                <div class="employee-card" onclick="orgViewer.showEmployeeDetail('${emp.employee_id}')">
                    <div class="employee-name">${emp.name}</div>
                    <div class="employee-info">
                        <span>${emp.team} - ${emp.position}</span>
                        <span class="badge-count">${badgeCount}バッジ (${totalPoints}pt)</span>
                    </div>
                </div>
            `;
        });

        this.elements.employeeList.innerHTML = html;
    }

    // 従業員詳細表示
    async showEmployeeDetail(employeeId) {
        try {
            this.elements.employeeDetail.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';
            this.elements.employeeModal.style.display = 'flex';

            const response = await fetch(`/api/employee/${encodeURIComponent(employeeId)}`);
            if (!response.ok) throw new Error('従業員詳細取得失敗');
            
            const data = await response.json();
            this.renderEmployeeDetail(data);
        } catch (error) {
            console.error('従業員詳細取得エラー:', error);
            this.elements.employeeDetail.innerHTML = '<p class="text-muted">従業員詳細の取得に失敗しました</p>';
        }
    }

    // 従業員詳細描画
    renderEmployeeDetail(data) {
        const employee = data.employee;
        const badges = data.badges || [];
        const stats = {
            badgeCount: data.badgeCount || 0,
            totalPoints: data.totalPoints || 0
        };

        let html = `
            <div class="employee-detail-header">
                <div class="employee-avatar">${employee.name.charAt(0)}</div>
                <div class="employee-detail-info">
                    <h3>${employee.name}</h3>
                    <p><i class="fas fa-envelope"></i> ${employee.email}</p>
                    <p><i class="fas fa-building"></i> ${employee.department} - ${employee.team}</p>
                    <p><i class="fas fa-id-badge"></i> ${employee.position}</p>
                    <p><i class="fas fa-trophy"></i> ${stats.badgeCount}バッジ取得 (${stats.totalPoints}ポイント)</p>
                </div>
            </div>
        `;

        if (badges.length > 0) {
            html += `
                <div class="badges-section">
                    <h4><i class="fas fa-medal"></i> 取得バッジ (${badges.length}個)</h4>
                    <div class="badges-grid">
            `;

            badges.forEach(badge => {
                const earnedDate = new Date(badge.earned_at).toLocaleDateString('ja-JP');
                html += `
                    <div class="badge-item difficulty-${badge.difficulty}">
                        <div class="badge-icon">${badge.icon}</div>
                        <div class="badge-name">${badge.name}</div>
                        <div class="badge-info">
                            <div>${badge.category_name} - ${badge.difficulty}</div>
                            <div>${badge.points}pt - ${earnedDate}取得</div>
                        </div>
                    </div>
                `;
            });

            html += `</div></div>`;
        } else {
            html += `
                <div class="badges-section">
                    <h4><i class="fas fa-medal"></i> 取得バッジ</h4>
                    <p class="text-muted">まだバッジを取得していません</p>
                </div>
            `;
        }

        this.elements.employeeDetail.innerHTML = html;
    }

    // モーダルを閉じる
    closeModal() {
        this.elements.employeeModal.style.display = 'none';
    }

    // エラー表示
    showError(message) {
        this.elements.loading.style.display = 'none';
        this.elements.dashboard.innerHTML = `
            <div class="container">
                <div class="panel text-center">
                    <i class="fas fa-exclamation-triangle fa-3x mb-4" style="color: #dc3545;"></i>
                    <h3>エラーが発生しました</h3>
                    <p>${message}</p>
                    <button class="btn btn-primary" onclick="window.location.reload()">
                        <i class="fas fa-refresh"></i> 再読み込み
                    </button>
                </div>
            </div>
        `;
        this.elements.dashboard.style.display = 'block';
    }
}

// アプリケーション初期化
const orgViewer = new OrganizationViewer();