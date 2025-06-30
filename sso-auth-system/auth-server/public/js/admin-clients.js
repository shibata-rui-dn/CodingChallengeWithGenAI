// Client Management JavaScript

class ClientManager {
    constructor() {
        this.currentPage = 1;
        this.pageSize = 10;
        this.currentSearch = '';
        this.currentStatusFilter = '';
        this.clients = [];
        this.pagination = null;
        this.editingClientId = null;

        this.initializeElements();
        this.initializeEventListeners();
        this.initializeModals();
        this.loadClients();
        this.loadStats();
    }

    initializeElements() {
        this.searchInput = document.getElementById('searchInput');
        this.statusFilter = document.getElementById('statusFilter');
        this.clientsTableBody = document.getElementById('clientsTableBody');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.paginationInfo = document.getElementById('paginationInfo');
        this.paginationControls = document.getElementById('paginationControls');
        
        // Stats elements
        this.totalClientsElement = document.getElementById('totalClients');
        this.activeClientsElement = document.getElementById('activeClients');
        this.inactiveClientsElement = document.getElementById('inactiveClients');

        // Form elements
        this.clientForm = document.getElementById('clientForm');
        this.modalTitle = document.getElementById('modalTitle');
        this.submitBtn = document.getElementById('submitBtn');
        this.redirectUrisList = document.getElementById('redirectUrisList');
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

        // Create client button
        const createBtn = document.getElementById('createClientBtn');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.openCreateModal());
        }

        // Form submission
        if (this.clientForm) {
            this.clientForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }

        // Add redirect URI button
        const addUriBtn = document.getElementById('addRedirectUri');
        if (addUriBtn) {
            addUriBtn.addEventListener('click', () => this.addRedirectUriField());
        }

        // Cancel buttons
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.clientModal.close());
        }

        // Secret modal buttons
        const copySecretBtn = document.getElementById('copySecret');
        if (copySecretBtn) {
            copySecretBtn.addEventListener('click', () => this.copySecret());
        }

        const closeSecretBtn = document.getElementById('closeSecretBtn');
        if (closeSecretBtn) {
            closeSecretBtn.addEventListener('click', () => this.secretModal.close());
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
        if (this.clientsTableBody) {
            this.clientsTableBody.addEventListener('click', (e) => this.handleTableClick(e));
        }

        // Event delegation for redirect URI actions
        if (this.redirectUrisList) {
            this.redirectUrisList.addEventListener('click', (e) => this.handleRedirectUriClick(e));
        }
    }

    handleTableClick(e) {
        const button = e.target.closest('.btn-action');
        if (!button) return;

        const clientId = button.dataset.clientId;
        const clientName = button.dataset.clientName;

        if (button.classList.contains('btn-edit')) {
            this.openEditModal(clientId);
        } else if (button.classList.contains('btn-regenerate')) {
            this.regenerateSecret(clientId);
        } else if (button.classList.contains('btn-delete')) {
            this.openDeleteModal(clientId, clientName);
        }
    }

    handleRedirectUriClick(e) {
        if (e.target.closest('.btn-remove-uri')) {
            e.target.closest('.uri-input-group').remove();
        }
    }

    initializeModals() {
        this.clientModal = new ModalManager('clientModal');
        this.secretModal = new ModalManager('secretModal');
        this.deleteModal = new ModalManager('deleteModal');
    }

    async loadClients() {
        try {
            LoadingManager.show(this.loadingOverlay);

            const params = {
                page: this.currentPage,
                limit: this.pageSize,
                search: this.currentSearch,
                active: this.currentStatusFilter
            };

            const response = await window.adminAPI.getClients(params);
            this.clients = response.clients || [];
            this.renderClients();
            this.updatePagination(response.pagination);

        } catch (error) {
            console.error('Failed to load clients:', error);
            ToastManager.error('Error', 'Failed to load clients: ' + error.message);
        } finally {
            LoadingManager.hide(this.loadingOverlay);
        }
    }

    async loadStats() {
        try {
            const response = await window.adminAPI.getClientStats();
            const stats = response.stats;

            if (this.totalClientsElement) {
                this.totalClientsElement.textContent = stats.total_clients || 0;
            }
            if (this.activeClientsElement) {
                this.activeClientsElement.textContent = stats.active_clients || 0;
            }
            if (this.inactiveClientsElement) {
                this.inactiveClientsElement.textContent = stats.inactive_clients || 0;
            }
        } catch (error) {
            console.error('Failed to load client stats:', error);
        }
    }

    renderClients() {
        if (!this.clientsTableBody) return;

        if (this.clients.length === 0) {
            this.clientsTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">
                        <p>No clients found</p>
                    </td>
                </tr>
            `;
            return;
        }

        this.clientsTableBody.innerHTML = this.clients.map(client => `
            <tr>
                <td>
                    <div class="user-info-cell">
                        <div class="user-name">${this.escapeHtml(client.name)}</div>
                        <div class="user-email">${this.escapeHtml(client.client_id)}</div>
                    </div>
                </td>
                <td>
                    <code style="font-size: 13px; color: #605e5c;">${this.escapeHtml(client.client_id)}</code>
                </td>
                <td>
                    <div style="max-width: 200px; overflow: hidden;">
                        ${client.redirect_uris.map(uri => 
                            `<div style="font-size: 12px; color: #605e5c; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${this.escapeHtml(uri)}">${this.escapeHtml(uri)}</div>`
                        ).join('')}
                    </div>
                </td>
                <td>
                    <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                        ${client.allowed_scopes.map(scope => 
                            `<span style="background: #f3f2f1; padding: 2px 6px; border-radius: 3px; font-size: 11px; color: #323130;">${this.escapeHtml(scope)}</span>`
                        ).join('')}
                    </div>
                </td>
                <td>
                    <span class="status-cell ${client.is_active ? 'active' : 'inactive'}">
                        ${client.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td class="date-cell">${Utils.formatDate(client.created_at)}</td>
                <td class="actions-cell">
                    <button class="btn-action btn-edit" data-client-id="${this.escapeHtml(client.client_id)}" title="Edit Client">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708L10.5 8.207l-3-3L12.146.146zM11.207 9l-3-3L3.5 10.707v3h3L11.207 9z"/>
                        </svg>
                        Edit
                    </button>
                    <button class="btn-action btn-regenerate" data-client-id="${this.escapeHtml(client.client_id)}" title="Regenerate Secret">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
                        </svg>
                        Secret
                    </button>
                    <button class="btn-action btn-delete" data-client-id="${this.escapeHtml(client.client_id)}" data-client-name="${this.escapeHtml(client.name)}" title="Delete Client">
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
            this.paginationInfo.textContent = `Showing ${start}-${end} of ${total} clients`;
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
        this.loadClients();
    }

    handleSearch() {
        this.currentSearch = this.searchInput.value.trim();
        this.currentPage = 1;
        this.loadClients();
    }

    handleStatusFilter() {
        this.currentStatusFilter = this.statusFilter.value;
        this.currentPage = 1;
        this.loadClients();
    }

    openCreateModal() {
        this.editingClientId = null;
        this.modalTitle.textContent = 'Create Client';
        this.submitBtn.textContent = 'Create Client';
        
        this.resetForm();
        this.setupDefaultRedirectUri();
        this.clientModal.open();
    }

    async openEditModal(clientId) {
        try {
            const response = await window.adminAPI.getClient(clientId);
            const client = response.client;

            this.editingClientId = clientId;
            this.modalTitle.textContent = 'Edit Client';
            this.submitBtn.textContent = 'Update Client';

            // Populate form
            document.getElementById('clientId').value = client.client_id || '';
            document.getElementById('clientId').disabled = true; // Can't change client ID
            document.getElementById('clientName').value = client.name || '';
            document.getElementById('isActive').value = client.is_active ? '1' : '0';

            // Populate redirect URIs
            this.setupRedirectUris(client.redirect_uris || []);

            // Populate scopes
            const scopeCheckboxes = document.querySelectorAll('input[name="scopes"]');
            scopeCheckboxes.forEach(checkbox => {
                checkbox.checked = client.allowed_scopes.includes(checkbox.value);
            });

            this.clientModal.open();

        } catch (error) {
            console.error('Failed to load client:', error);
            ToastManager.error('Error', 'Failed to load client details: ' + error.message);
        }
    }

    openDeleteModal(clientId, clientName) {
        this.deletingClientId = clientId;
        document.getElementById('deleteClientName').textContent = clientName;
        this.deleteModal.open();
    }

    async regenerateSecret(clientId) {
        if (!confirm('Are you sure you want to regenerate the client secret? This will invalidate the current secret.')) {
            return;
        }

        try {
            const response = await window.adminAPI.regenerateClientSecret(clientId);
            
            // Show the new secret
            document.getElementById('clientSecret').value = response.client_secret;
            this.secretModal.open();

        } catch (error) {
            console.error('Failed to regenerate secret:', error);
            ToastManager.error('Error', 'Failed to regenerate client secret: ' + error.message);
        }
    }

    setupDefaultRedirectUri() {
        this.redirectUrisList.innerHTML = `
            <div class="uri-input-group">
                <input type="url" class="uri-input" placeholder="https://example.com/callback" required>
                <button type="button" class="btn-remove-uri">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M.293.293a1 1 0 0 1 1.414 0L8 6.586 14.293.293a1 1 0 1 1 1.414 1.414L9.414 8l6.293 6.293a1 1 0 0 1-1.414 1.414L8 9.414l-6.293 6.293a1 1 0 0 1-1.414-1.414L6.586 8 .293 1.707a1 1 0 0 1 0-1.414z"/>
                    </svg>
                </button>
            </div>
        `;
    }

    setupRedirectUris(uris) {
        this.redirectUrisList.innerHTML = '';
        
        if (uris.length === 0) {
            this.addRedirectUriField();
        } else {
            uris.forEach(uri => {
                this.addRedirectUriField(uri);
            });
        }
    }

    addRedirectUriField(value = '') {
        const uriGroup = document.createElement('div');
        uriGroup.className = 'uri-input-group';
        uriGroup.innerHTML = `
            <input type="url" class="uri-input" placeholder="https://example.com/callback" value="${this.escapeHtml(value)}" required>
            <button type="button" class="btn-remove-uri">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M.293.293a1 1 0 0 1 1.414 0L8 6.586 14.293.293a1 1 0 1 1 1.414 1.414L9.414 8l6.293 6.293a1 1 0 0 1-1.414 1.414L8 9.414l-6.293 6.293a1 1 0 0 1-1.414-1.414L6.586 8 .293 1.707a1 1 0 0 1 0-1.414z"/>
                </svg>
            </button>
        `;
        this.redirectUrisList.appendChild(uriGroup);
    }

    async handleFormSubmit(e) {
        e.preventDefault();

        const formData = new FormData(this.clientForm);
        const clientData = {
            client_id: formData.get('client_id'),
            name: formData.get('name'),
            is_active: formData.get('is_active') === '1'
        };

        // Collect redirect URIs
        const uriInputs = this.redirectUrisList.querySelectorAll('.uri-input');
        const redirectUris = Array.from(uriInputs)
            .map(input => input.value.trim())
            .filter(uri => uri);

        if (redirectUris.length === 0) {
            ToastManager.error('Validation Error', 'At least one redirect URI is required');
            return;
        }

        // Validate redirect URIs
        for (const uri of redirectUris) {
            if (!Utils.validateUrl(uri)) {
                ToastManager.error('Validation Error', `Invalid redirect URI: ${uri}`);
                return;
            }
        }

        clientData.redirect_uris = redirectUris;

        // Collect allowed scopes
        const scopeCheckboxes = document.querySelectorAll('input[name="scopes"]:checked');
        clientData.allowed_scopes = Array.from(scopeCheckboxes).map(cb => cb.value);

        if (clientData.allowed_scopes.length === 0) {
            ToastManager.error('Validation Error', 'At least one scope must be selected');
            return;
        }

        // Basic validation
        if (!clientData.client_id || !clientData.name) {
            ToastManager.error('Validation Error', 'Client ID and name are required');
            return;
        }

        try {
            this.submitBtn.disabled = true;
            this.submitBtn.textContent = this.editingClientId ? 'Updating...' : 'Creating...';

            let response;
            if (this.editingClientId) {
                response = await window.adminAPI.updateClient(this.editingClientId, clientData);
                ToastManager.success('Success', 'Client updated successfully');
            } else {
                response = await window.adminAPI.createClient(clientData);
                ToastManager.success('Success', 'Client created successfully');
                
                // Show the client secret for new clients
                if (response.client && response.client.client_secret) {
                    document.getElementById('clientSecret').value = response.client.client_secret;
                    setTimeout(() => {
                        this.secretModal.open();
                    }, 100);
                }
            }

            this.clientModal.close();
            this.loadClients();
            this.loadStats();

        } catch (error) {
            console.error('Failed to save client:', error);
            ToastManager.error('Error', 'Failed to save client: ' + error.message);
        } finally {
            this.submitBtn.disabled = false;
            this.submitBtn.textContent = this.editingClientId ? 'Update Client' : 'Create Client';
        }
    }

    async confirmDelete() {
        if (!this.deletingClientId) return;

        try {
            const deleteBtn = document.getElementById('confirmDeleteBtn');
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting...';

            await window.adminAPI.deleteClient(this.deletingClientId);
            
            ToastManager.success('Success', 'Client deleted successfully');
            this.deleteModal.close();
            this.loadClients();
            this.loadStats();

        } catch (error) {
            console.error('Failed to delete client:', error);
            ToastManager.error('Error', 'Failed to delete client: ' + error.message);
        } finally {
            const deleteBtn = document.getElementById('confirmDeleteBtn');
            deleteBtn.disabled = false;
            deleteBtn.textContent = 'Delete Client';
        }
    }

    async copySecret() {
        const secretInput = document.getElementById('clientSecret');
        
        try {
            await Utils.copyToClipboard(secretInput.value);
            ToastManager.success('Copied', 'Client secret copied to clipboard');
        } catch (error) {
            console.error('Failed to copy secret:', error);
            ToastManager.error('Error', 'Failed to copy to clipboard');
        }
    }

    resetForm() {
        if (this.clientForm) {
            this.clientForm.reset();
            document.getElementById('clientId').disabled = false;
            document.getElementById('isActive').value = '1';
            
            // Reset scopes to default
            const scopeCheckboxes = document.querySelectorAll('input[name="scopes"]');
            scopeCheckboxes.forEach(checkbox => {
                checkbox.checked = ['openid', 'profile', 'email'].includes(checkbox.value);
            });
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

// Initialize client manager when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize on clients page
    if (document.getElementById('clientsTable')) {
        window.clientManager = new ClientManager();
    }
});