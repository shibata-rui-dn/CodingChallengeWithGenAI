// User Management JavaScript

class UserManager {
    constructor() {
        this.currentPage = 1;
        this.pageSize = 10;
        this.currentSearch = '';
        this.currentRoleFilter = '';
        this.currentStatusFilter = '';
        this.users = [];
        this.pagination = null;
        this.editingUserId = null;

        this.initializeElements();
        this.initializeEventListeners();
        this.initializeModals();
        this.loadUsers();
        this.loadStats();
    }

    initializeElements() {
        this.searchInput = document.getElementById('searchInput');
        this.roleFilter = document.getElementById('roleFilter');
        this.statusFilter = document.getElementById('statusFilter');
        this.usersTableBody = document.getElementById('usersTableBody');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.paginationInfo = document.getElementById('paginationInfo');
        this.paginationControls = document.getElementById('paginationControls');

        // Stats elements
        this.totalUsersElement = document.getElementById('totalUsers');
        this.adminCountElement = document.getElementById('adminCount');
        this.activeUsersElement = document.getElementById('activeUsers');

        // Form elements
        this.userForm = document.getElementById('userForm');
        this.modalTitle = document.getElementById('modalTitle');
        this.submitBtn = document.getElementById('submitBtn');
        this.passwordRequired = document.getElementById('passwordRequired');
        this.passwordHelp = document.getElementById('passwordHelp');
    }

    initializeEventListeners() {
        // Search and filters
        if (this.searchInput) {
            this.searchInput.addEventListener('input',
                Utils.debounce(() => this.handleSearch(), 300)
            );
        }

        if (this.roleFilter) {
            this.roleFilter.addEventListener('change', () => this.handleRoleFilter());
        }

        if (this.statusFilter) {
            this.statusFilter.addEventListener('change', () => this.handleStatusFilter());
        }

        // Create user button
        const createBtn = document.getElementById('createUserBtn');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.openCreateModal());
        }

        // Form submission
        if (this.userForm) {
            this.userForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }

        // Cancel buttons
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.userModal.close());
        }

        // Delete modal buttons
        const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
        if (confirmDeleteBtn) {
            confirmDeleteBtn.addEventListener('click', () => this.confirmDelete());
        }

        const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
        if (cancelDeleteBtn) {
            cancelDeleteBtn.addEventListener('click', () => this.deleteModal.close());
        }

        // Event delegation for table actions
        if (this.usersTableBody) {
            this.usersTableBody.addEventListener('click', (e) => this.handleTableClick(e));
        }
    }

    handleTableClick(e) {
        const button = e.target.closest('.btn-action');
        if (!button) return;

        const userId = parseInt(button.dataset.userId);
        const username = button.dataset.username;

        if (button.classList.contains('btn-edit')) {
            this.openEditModal(userId);
        } else if (button.classList.contains('btn-delete')) {
            this.openDeleteModal(userId, username);
        }
    }

    initializeModals() {
        this.userModal = new ModalManager('userModal');
        this.deleteModal = new ModalManager('deleteModal');
    }

    async loadUsers() {
        try {
            LoadingManager.show(this.loadingOverlay);

            const params = {
                page: this.currentPage,
                limit: this.pageSize,
                search: this.currentSearch,
                role: this.currentRoleFilter
            };

            // Add status filter if using numeric values
            if (this.currentStatusFilter === 'active') {
                params.is_active = '1';
            } else if (this.currentStatusFilter === 'inactive') {
                params.is_active = '0';
            }

            const response = await window.adminAPI.getUsers(params);
            this.users = response.users || [];
            this.renderUsers();
            this.updatePagination(response.pagination);

        } catch (error) {
            console.error('Failed to load users:', error);
            ToastManager.error('Error', 'Failed to load users: ' + error.message);
        } finally {
            LoadingManager.hide(this.loadingOverlay);
        }
    }

    async loadStats() {
        try {
            const response = await window.adminAPI.getUserStats();
            const stats = response.stats;

            if (this.totalUsersElement) {
                this.totalUsersElement.textContent = stats.total_users || 0;
            }
            if (this.adminCountElement) {
                this.adminCountElement.textContent = stats.admin_count || 0;
            }
            if (this.activeUsersElement) {
                this.activeUsersElement.textContent = stats.active_users || 0;
            }
        } catch (error) {
            console.error('Failed to load user stats:', error);
        }
    }

    renderUsers() {
        if (!this.usersTableBody) return;

        if (this.users.length === 0) {
            this.usersTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state"> <!-- 🆕 colspan更新 -->
                    <p>No users found</p>
                </td>
            </tr>
        `;
            return;
        }

        this.usersTableBody.innerHTML = this.users.map(user => `
        <tr>
            <td>
                <div class="user-cell">
                    <div class="user-avatar" style="background-color: ${Utils.generateAvatarColor(user.username)}">
                        ${Utils.getInitials(user.first_name, user.last_name, user.username)}
                    </div>
                    <div class="user-info-cell">
                        <div class="user-name">${this.escapeHtml(user.username)}</div>
                        <div class="user-email">${this.escapeHtml(user.first_name || '')} ${this.escapeHtml(user.last_name || '')}</div>
                    </div>
                </div>
            </td>
            <td>${this.escapeHtml(user.email)}</td>
            <!-- 🆕 組織情報列 -->
            <td>
                <div class="organization-cell">
                    <div class="org-item">
                        <span class="org-label">Department:</span>
                        <span class="org-value">${this.escapeHtml(user.department || '-')}</span>
                    </div>
                    <div class="org-item">
                        <span class="org-label">Team:</span>
                        <span class="org-value">${this.escapeHtml(user.team || '-')}</span>
                    </div>
                    <div class="org-item">
                        <span class="org-label">Supervisor:</span>
                        <span class="org-value">${this.escapeHtml(user.supervisor || '-')}</span>
                    </div>
                </div>
            </td>
            <td>
                <span class="role-badge-cell ${user.role}">
                    ${user.role === 'admin' ? 'Administrator' : 'User'}
                </span>
            </td>
            <td>
                <span class="status-cell ${user.is_active ? 'active' : 'inactive'}">
                    ${user.is_active ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td class="date-cell">${Utils.formatDate(user.created_at)}</td>
            <td class="actions-cell">
                <button class="btn-action btn-edit" data-user-id="${user.id}" title="Edit User">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708L10.5 8.207l-3-3L12.146.146zM11.207 9l-3-3L3.5 10.707v3h3L11.207 9z"/>
                    </svg>
                    Edit
                </button>
                <button class="btn-action btn-delete" data-user-id="${user.id}" data-username="${this.escapeHtml(user.username)}" title="Delete User">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                        <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                    </svg>
                    Delete
                </button>
            </td>
        </tr>
    `).join('');
    }

    updatePagination(paginationData) {
        if (!paginationData) return;

        // Update pagination info
        if (this.paginationInfo) {
            const { page, limit, total } = paginationData;
            const start = (page - 1) * limit + 1;
            const end = Math.min(page * limit, total);
            this.paginationInfo.textContent = `Showing ${start}-${end} of ${total} users`;
        }

        // Initialize pagination controls
        if (!this.pagination) {
            this.pagination = new PaginationManager(
                this.paginationControls,
                (page) => this.goToPage(page)
            );
        }

        this.pagination.update(paginationData.page, paginationData.pages);
    }

    goToPage(page) {
        this.currentPage = page;
        this.loadUsers();
    }

    handleSearch() {
        this.currentSearch = this.searchInput.value.trim();
        this.currentPage = 1;
        this.loadUsers();
    }

    handleRoleFilter() {
        this.currentRoleFilter = this.roleFilter.value;
        this.currentPage = 1;
        this.loadUsers();
    }

    handleStatusFilter() {
        this.currentStatusFilter = this.statusFilter.value;
        this.currentPage = 1;
        this.loadUsers();
    }

    openCreateModal() {
        this.editingUserId = null;
        this.modalTitle.textContent = 'Create User';
        this.submitBtn.textContent = 'Create User';
        this.passwordRequired.style.display = 'inline';
        this.passwordHelp.textContent = 'Minimum 6 characters.';

        this.resetForm();
        this.userModal.open();
    }

    async openEditModal(userId) {
        try {
            const response = await window.adminAPI.getUser(userId);
            const user = response.user;

            this.editingUserId = userId;
            this.modalTitle.textContent = 'Edit User';
            this.submitBtn.textContent = 'Update User';
            this.passwordRequired.style.display = 'none';
            this.passwordHelp.textContent = 'Leave blank to keep current password.';

            // Populate form
            document.getElementById('username').value = user.username || '';
            document.getElementById('email').value = user.email || '';
            document.getElementById('firstName').value = user.first_name || '';
            document.getElementById('lastName').value = user.last_name || '';
            // 🆕 組織情報フィールド
            document.getElementById('department').value = user.department || '';
            document.getElementById('team').value = user.team || '';
            document.getElementById('supervisor').value = user.supervisor || '';
            document.getElementById('role').value = user.role || 'user';
            document.getElementById('isActive').value = user.is_active ? '1' : '0';
            document.getElementById('password').value = '';

            this.userModal.open();

        } catch (error) {
            console.error('Failed to load user:', error);
            ToastManager.error('Error', 'Failed to load user details: ' + error.message);
        }
    }

    openDeleteModal(userId, username) {
        this.deletingUserId = userId;
        document.getElementById('deleteUserName').textContent = username;
        this.deleteModal.open();
    }

    async handleFormSubmit(e) {
        e.preventDefault();

        const formData = new FormData(this.userForm);
        const userData = {
            username: formData.get('username'),
            email: formData.get('email'),
            first_name: formData.get('first_name'),
            last_name: formData.get('last_name'),
            // 🆕 組織情報
            department: formData.get('department'),
            team: formData.get('team'),
            supervisor: formData.get('supervisor'),
            role: formData.get('role'),
            is_active: formData.get('is_active') === '1'
        };

        const password = formData.get('password');
        if (password) {
            userData.password = password;
        }

        // Validation
        if (!userData.username || !userData.email) {
            ToastManager.error('Validation Error', 'Username and email are required');
            return;
        }

        if (!Utils.validateEmail(userData.email)) {
            ToastManager.error('Validation Error', 'Please enter a valid email address');
            return;
        }

        if (!this.editingUserId && !password) {
            ToastManager.error('Validation Error', 'Password is required for new users');
            return;
        }

        if (password && password.length < 6) {
            ToastManager.error('Validation Error', 'Password must be at least 6 characters long');
            return;
        }

        try {
            this.submitBtn.disabled = true;
            this.submitBtn.textContent = this.editingUserId ? 'Updating...' : 'Creating...';

            if (this.editingUserId) {
                await window.adminAPI.updateUser(this.editingUserId, userData);
                ToastManager.success('Success', 'User updated successfully');
            } else {
                await window.adminAPI.createUser(userData);
                ToastManager.success('Success', 'User created successfully');
            }

            this.userModal.close();
            this.loadUsers();
            this.loadStats();

        } catch (error) {
            console.error('Failed to save user:', error);
            ToastManager.error('Error', 'Failed to save user: ' + error.message);
        } finally {
            this.submitBtn.disabled = false;
            this.submitBtn.textContent = this.editingUserId ? 'Update User' : 'Create User';
        }
    }

    async confirmDelete() {
        if (!this.deletingUserId) return;

        try {
            const deleteBtn = document.getElementById('confirmDeleteBtn');
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting...';

            await window.adminAPI.deleteUser(this.deletingUserId);

            ToastManager.success('Success', 'User deleted successfully');
            this.deleteModal.close();
            this.loadUsers();
            this.loadStats();

        } catch (error) {
            console.error('Failed to delete user:', error);
            ToastManager.error('Error', 'Failed to delete user: ' + error.message);
        } finally {
            const deleteBtn = document.getElementById('confirmDeleteBtn');
            deleteBtn.disabled = false;
            deleteBtn.textContent = 'Delete User';
        }
    }

    resetForm() {
        if (this.userForm) {
            this.userForm.reset();
            // 🆕 組織情報フィールドもリセット
            document.getElementById('department').value = '';
            document.getElementById('team').value = '';
            document.getElementById('supervisor').value = '';
            document.getElementById('role').value = 'user';
            document.getElementById('isActive').value = '1';
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.toString().replace(/[&<>"']/g, (m) => map[m]);
    }
}

// Initialize user manager when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    // Only initialize on users page
    if (document.getElementById('usersTable')) {
        window.userManager = new UserManager();
    }
});