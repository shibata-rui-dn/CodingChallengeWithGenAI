// Admin Panel Common JavaScript

class AdminAPI {
    constructor() {
        this.baseUrl = window.location.origin;
        this.token = this.getAuthToken();
    }

    getAuthToken() {
        // In a real implementation, this would be stored securely
        // For now, we'll extract it from a cookie or local context
        return window.localStorage.getItem('admin_token') || '';
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`,
                ...options.headers
            },
            ...options
        };

        try {
            const response = await fetch(url, config);
            
            if (response.status === 401) {
                this.handleUnauthorized();
                throw new Error('Unauthorized');
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error_description || errorData.error || `HTTP ${response.status}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            
            return await response.text();
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    }

    handleUnauthorized() {
        ToastManager.error('Session expired', 'Please log in again');
        setTimeout(() => {
            window.location.href = '/auth/login';
        }, 2000);
    }

    // User API methods
    async getUsers(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/admin/api/users${query ? '?' + query : ''}`);
    }

    async getUser(id) {
        return this.request(`/admin/api/users/${id}`);
    }

    async createUser(userData) {
        return this.request('/admin/api/users', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    }

    async updateUser(id, userData) {
        return this.request(`/admin/api/users/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(userData)
        });
    }

    async deleteUser(id) {
        return this.request(`/admin/api/users/${id}`, {
            method: 'DELETE'
        });
    }

    async getUserStats() {
        return this.request('/admin/api/users/stats');
    }

    // Client API methods
    async getClients(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/admin/api/clients${query ? '?' + query : ''}`);
    }

    async getClient(clientId) {
        return this.request(`/admin/api/clients/${clientId}`);
    }

    async createClient(clientData) {
        return this.request('/admin/api/clients', {
            method: 'POST',
            body: JSON.stringify(clientData)
        });
    }

    async updateClient(clientId, clientData) {
        return this.request(`/admin/api/clients/${clientId}`, {
            method: 'PATCH',
            body: JSON.stringify(clientData)
        });
    }

    async deleteClient(clientId) {
        return this.request(`/admin/api/clients/${clientId}`, {
            method: 'DELETE'
        });
    }

    async regenerateClientSecret(clientId) {
        return this.request(`/admin/api/clients/${clientId}/regenerate-secret`, {
            method: 'POST'
        });
    }

    async getClientStats() {
        return this.request('/admin/api/clients/stats');
    }

    // Origin API methods
    async getOrigins(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/admin/origins${query ? '?' + query : ''}`);
    }

    async createOrigin(originData) {
        return this.request('/admin/origins', {
            method: 'POST',
            body: JSON.stringify(originData)
        });
    }

    async updateOrigin(id, originData) {
        return this.request(`/admin/origins/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(originData)
        });
    }

    async deleteOrigin(id) {
        return this.request(`/admin/origins/${id}`, {
            method: 'DELETE'
        });
    }

    async refreshCors() {
        return this.request('/admin/origins/refresh', {
            method: 'POST'
        });
    }
}

class ToastManager {
    static container = null;

    static init() {
        if (!this.container) {
            this.container = document.getElementById('toastContainer');
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.id = 'toastContainer';
                this.container.className = 'toast-container';
                document.body.appendChild(this.container);
            }
        }
    }

    static show(type, title, message, duration = 5000) {
        this.init();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '<svg width="16" height="16" viewBox="0 0 16 16" fill="#107c10"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>',
            error: '<svg width="16" height="16" viewBox="0 0 16 16" fill="#d13438"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>',
            warning: '<svg width="16" height="16" viewBox="0 0 16 16" fill="#ffb900"><path d="M7.938 2.016A.13.13 0 0 1 8.002 2a.13.13 0 0 1 .063.016.146.146 0 0 1 .054.057l6.857 11.667c.036.06.035.124.002.183a.163.163 0 0 1-.054.06.116.116 0 0 1-.066.017H1.146a.115.115 0 0 1-.066-.017.163.163 0 0 1-.054-.06.176.176 0 0 1 .002-.183L7.884 2.073a.147.147 0 0 1 .054-.057z"/></svg>',
            info: '<svg width="16" height="16" viewBox="0 0 16 16" fill="#0078d4"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>'
        };

        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M.293.293a1 1 0 0 1 1.414 0L8 6.586 14.293.293a1 1 0 1 1 1.414 1.414L9.414 8l6.293 6.293a1 1 0 0 1-1.414 1.414L8 9.414l-6.293 6.293a1 1 0 0 1-1.414-1.414L6.586 8 .293 1.707a1 1 0 0 1 0-1.414z"/>
                </svg>
            </button>
        `;

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            this.remove(toast);
        });

        this.container.appendChild(toast);

        // Auto remove after duration
        if (duration > 0) {
            setTimeout(() => {
                this.remove(toast);
            }, duration);
        }

        return toast;
    }

    static success(title, message, duration) {
        return this.show('success', title, message, duration);
    }

    static error(title, message, duration) {
        return this.show('error', title, message, duration);
    }

    static warning(title, message, duration) {
        return this.show('warning', title, message, duration);
    }

    static info(title, message, duration) {
        return this.show('info', title, message, duration);
    }

    static remove(toast) {
        if (toast && toast.parentNode) {
            toast.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }
    }
}

class LoadingManager {
    static show(element) {
        if (element) {
            element.classList.remove('hidden');
        }
    }

    static hide(element) {
        if (element) {
            element.classList.add('hidden');
        }
    }
}

class PaginationManager {
    constructor(container, onPageChange) {
        this.container = container;
        this.onPageChange = onPageChange;
        this.currentPage = 1;
        this.totalPages = 1;
    }

    update(page, totalPages) {
        this.currentPage = page;
        this.totalPages = totalPages;
        this.render();
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = '';

        // Previous button
        const prevBtn = this.createButton('‹', this.currentPage - 1, this.currentPage <= 1);
        this.container.appendChild(prevBtn);

        // Page numbers
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(this.totalPages, this.currentPage + 2);

        if (startPage > 1) {
            this.container.appendChild(this.createButton('1', 1));
            if (startPage > 2) {
                this.container.appendChild(this.createSpan('...'));
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            const btn = this.createButton(i.toString(), i, false, i === this.currentPage);
            this.container.appendChild(btn);
        }

        if (endPage < this.totalPages) {
            if (endPage < this.totalPages - 1) {
                this.container.appendChild(this.createSpan('...'));
            }
            this.container.appendChild(this.createButton(this.totalPages.toString(), this.totalPages));
        }

        // Next button
        const nextBtn = this.createButton('›', this.currentPage + 1, this.currentPage >= this.totalPages);
        this.container.appendChild(nextBtn);
    }

    createButton(text, page, disabled = false, active = false) {
        const btn = document.createElement('button');
        btn.className = `page-btn ${active ? 'active' : ''}`;
        btn.textContent = text;
        btn.disabled = disabled;
        
        if (!disabled) {
            btn.addEventListener('click', () => {
                if (this.onPageChange) {
                    this.onPageChange(page);
                }
            });
        }

        return btn;
    }

    createSpan(text) {
        const span = document.createElement('span');
        span.className = 'page-ellipsis';
        span.textContent = text;
        return span;
    }
}

class ModalManager {
    constructor(modalId) {
        this.modal = document.getElementById(modalId);
        this.isOpen = false;
        this.setupEventListeners();
    }

    setupEventListeners() {
        if (!this.modal) return;

        // Close button
        const closeBtn = this.modal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Background click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    open() {
        if (this.modal) {
            this.modal.classList.add('show');
            this.isOpen = true;
            document.body.style.overflow = 'hidden';
        }
    }

    close() {
        if (this.modal) {
            this.modal.classList.remove('show');
            this.isOpen = false;
            document.body.style.overflow = '';
        }
    }
}

// Utility functions
const Utils = {
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    formatDateTime(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    copyToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        } else {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'absolute';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                return Promise.resolve();
            } catch (error) {
                return Promise.reject(error);
            } finally {
                document.body.removeChild(textArea);
            }
        }
    },

    generateAvatarColor(text) {
        const colors = [
            '#0078d4', '#d13438', '#107c10', '#ff8c00',
            '#5c2d91', '#e3008c', '#00bcf2', '#498205'
        ];
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = text.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    },

    getInitials(firstName = '', lastName = '', username = '') {
        if (firstName && lastName) {
            return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
        } else if (firstName) {
            return firstName.charAt(0).toUpperCase();
        } else if (username) {
            return username.charAt(0).toUpperCase();
        }
        return '?';
    },

    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    validateUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }
};

// Global API instance
window.adminAPI = new AdminAPI();

// Initialize common functionality
document.addEventListener('DOMContentLoaded', function() {
    // Add slideOut animation to CSS if not present
    if (!document.querySelector('#toast-animations')) {
        const style = document.createElement('style');
        style.id = 'toast-animations';
        style.textContent = `
            @keyframes slideOut {
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Initialize tooltips and other common UI elements
    initCommonUI();
});

function initCommonUI() {
    // Add any common UI initialization here
    console.log('Admin panel initialized');
}