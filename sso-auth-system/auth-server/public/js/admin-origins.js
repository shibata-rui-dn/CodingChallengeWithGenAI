// Origin Management JavaScript

class OriginManager {
    constructor() {
        this.currentSearch = '';
        this.currentStatusFilter = '';
        this.origins = [];
        this.editingOriginId = null;

        this.initializeElements();
        this.initializeEventListeners();
        this.initializeModals();
        this.loadOrigins();
    }

    initializeElements() {
        this.searchInput = document.getElementById('searchInput');
        this.statusFilter = document.getElementById('statusFilter');
        this.originsTableBody = document.getElementById('originsTableBody');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.paginationInfo = document.getElementById('paginationInfo');
        
        // Form elements
        this.originForm = document.getElementById('originForm');
        this.modalTitle = document.getElementById('modalTitle');
        this.submitBtn = document.getElementById('submitBtn');
    }

    initializeEventListeners() {
        // Search and filters
        if (this.searchInput) {
            this.searchInput.addEventListener('input', 
                Utils.debounce(() => this.handleSearch(), 300)
            );
        }

        if (this.statusFilter) {
            this.statusFilter.addEventListener('change', () => this.handleStatusFilter());
        }

        // Refresh CORS button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshCors());
        }

        // Create origin button
        const createBtn = document.getElementById('createOriginBtn');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.openCreateModal());
        }

        // Form submission
        if (this.originForm) {
            this.originForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }

        // Cancel buttons
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.originModal.close());
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
        if (this.originsTableBody) {
            this.originsTableBody.addEventListener('click', (e) => this.handleTableClick(e));
        }
    }

    handleTableClick(e) {
        const button = e.target.closest('.btn-action');
        if (!button) return;

        const originId = parseInt(button.dataset.originId);
        const originUrl = button.dataset.originUrl;

        if (button.classList.contains('btn-edit')) {
            const isActive = button.dataset.isActive === 'true';
            this.toggleOriginStatus(originId, !isActive);
        } else if (button.classList.contains('btn-delete')) {
            this.openDeleteModal(originId, originUrl);
        }
    }

    initializeModals() {
        this.originModal = new ModalManager('originModal');
        this.deleteModal = new ModalManager('deleteModal');
    }

    async loadOrigins() {
        try {
            LoadingManager.show(this.loadingOverlay);

            const params = {};
            if (this.currentSearch) {
                params.search = this.currentSearch;
            }
            if (this.currentStatusFilter) {
                params.active = this.currentStatusFilter === 'active' ? '1' : '0';
            }

            const response = await window.adminAPI.getOrigins(params);
            this.origins = response.origins || [];
            this.renderOrigins();
            this.updatePaginationInfo();

        } catch (error) {
            console.error('Failed to load origins:', error);
            ToastManager.error('Error', 'Failed to load origins: ' + error.message);
            this.renderError();
        } finally {
            LoadingManager.hide(this.loadingOverlay);
        }
    }

    renderOrigins() {
        if (!this.originsTableBody) return;

        if (this.origins.length === 0) {
            this.originsTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        <p>No origins found</p>
                    </td>
                </tr>
            `;
            return;
        }

        this.originsTableBody.innerHTML = this.origins.map(origin => `
            <tr>
                <td>
                    <div style="font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; word-break: break-all;">
                        ${this.escapeHtml(origin.origin)}
                    </div>
                </td>
                <td>
                    <div style="max-width: 200px; word-wrap: break-word;">
                        ${this.escapeHtml(origin.description || 'No description')}
                    </div>
                </td>
                <td>
                    <div style="font-size: 13px; color: #605e5c;">
                        ${this.escapeHtml(origin.added_by_username || 'System')}
                    </div>
                </td>
                <td>
                    <span class="status-cell ${origin.is_active ? 'active' : 'inactive'}">
                        ${origin.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td class="date-cell">${Utils.formatDate(origin.created_at)}</td>
                <td class="actions-cell">
                    <button class="btn-action btn-edit" 
                            data-origin-id="${origin.id}" 
                            data-is-active="${origin.is_active}"
                            title="${origin.is_active ? 'Disable' : 'Enable'} Origin">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            ${origin.is_active ? 
                                '<path d="M1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0zM8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm0 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1z"/><path d="M4.5 7.5a.5.5 0 0 0 0 1h7a.5.5 0 0 0 0-1h-7z"/>' :
                                '<path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>'
                            }
                        </svg>
                        ${origin.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button class="btn-action btn-delete" 
                            data-origin-id="${origin.id}" 
                            data-origin-url="${this.escapeHtml(origin.origin)}"
                            title="Delete Origin">
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

    renderError() {
        if (!this.originsTableBody) return;

        this.originsTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <p>Failed to load origins. Please try refreshing the page.</p>
                </td>
            </tr>
        `;
    }

    updatePaginationInfo() {
        if (this.paginationInfo) {
            const total = this.origins.length;
            const active = this.origins.filter(o => o.is_active).length;
            this.paginationInfo.textContent = `Showing ${total} origins (${active} active)`;
        }
    }

    handleSearch() {
        this.currentSearch = this.searchInput.value.trim();
        this.loadOrigins();
    }

    handleStatusFilter() {
        this.currentStatusFilter = this.statusFilter.value;
        this.loadOrigins();
    }

    async refreshCors() {
        try {
            const refreshBtn = document.getElementById('refreshBtn');
            const originalText = refreshBtn.textContent;
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="animation: spin 1s linear infinite;">
                    <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                    <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
                </svg>
                Refreshing...
            `;

            const response = await window.adminAPI.refreshCors();
            ToastManager.success('Success', `CORS configuration refreshed. ${response.count} active origins loaded.`);

        } catch (error) {
            console.error('Failed to refresh CORS:', error);
            ToastManager.error('Error', 'Failed to refresh CORS configuration: ' + error.message);
        } finally {
            const refreshBtn = document.getElementById('refreshBtn');
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                    <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
                </svg>
                Refresh CORS
            `;
        }
    }

    openCreateModal() {
        this.editingOriginId = null;
        this.modalTitle.textContent = 'Add Origin';
        this.submitBtn.textContent = 'Add Origin';
        
        this.resetForm();
        this.originModal.open();
    }

    openDeleteModal(originId, originUrl) {
        this.deletingOriginId = originId;
        document.getElementById('deleteOriginUrl').textContent = originUrl;
        this.deleteModal.open();
    }

    async toggleOriginStatus(originId, newStatus) {
        try {
            await window.adminAPI.updateOrigin(originId, { is_active: newStatus });
            
            const action = newStatus ? 'enabled' : 'disabled';
            ToastManager.success('Success', `Origin ${action} successfully`);
            
            // Reload origins to reflect changes
            this.loadOrigins();
            
            // Auto-refresh CORS after status change
            await this.refreshCors();

        } catch (error) {
            console.error('Failed to toggle origin status:', error);
            ToastManager.error('Error', 'Failed to update origin status: ' + error.message);
        }
    }

    async handleFormSubmit(e) {
        e.preventDefault();

        const formData = new FormData(this.originForm);
        const originData = {
            origin: formData.get('origin').trim(),
            description: formData.get('description').trim()
        };

        // Validation
        if (!originData.origin) {
            ToastManager.error('Validation Error', 'Origin URL is required');
            return;
        }

        if (!Utils.validateUrl(originData.origin)) {
            ToastManager.error('Validation Error', 'Please enter a valid URL (including http:// or https://)');
            return;
        }

        try {
            this.submitBtn.disabled = true;
            this.submitBtn.textContent = 'Adding...';

            await window.adminAPI.createOrigin(originData);
            ToastManager.success('Success', 'Origin added successfully');

            this.originModal.close();
            this.loadOrigins();
            
            // Auto-refresh CORS after adding new origin
            await this.refreshCors();

        } catch (error) {
            console.error('Failed to save origin:', error);
            ToastManager.error('Error', 'Failed to save origin: ' + error.message);
        } finally {
            this.submitBtn.disabled = false;
            this.submitBtn.textContent = 'Add Origin';
        }
    }

    async confirmDelete() {
        if (!this.deletingOriginId) return;

        try {
            const deleteBtn = document.getElementById('confirmDeleteBtn');
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting...';

            await window.adminAPI.deleteOrigin(this.deletingOriginId);
            
            ToastManager.success('Success', 'Origin deleted successfully');
            this.deleteModal.close();
            this.loadOrigins();
            
            // Auto-refresh CORS after deletion
            await this.refreshCors();

        } catch (error) {
            console.error('Failed to delete origin:', error);
            ToastManager.error('Error', 'Failed to delete origin: ' + error.message);
        } finally {
            const deleteBtn = document.getElementById('confirmDeleteBtn');
            deleteBtn.disabled = false;
            deleteBtn.textContent = 'Delete Origin';
        }
    }

    resetForm() {
        if (this.originForm) {
            this.originForm.reset();
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

// Initialize origin manager when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize on origins page
    if (document.getElementById('originsTable')) {
        window.originManager = new OriginManager();
    }
});