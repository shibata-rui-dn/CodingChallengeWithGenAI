document.addEventListener('DOMContentLoaded', function () {
    const form = document.querySelector('.login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const submitButton = form.querySelector('.btn-primary');
    const messageArea = document.querySelector('.message-area');

    // ページロード時にボタン状態をリセット
    resetButtonState();

    // URLパラメータをクリア
    clearURLParameters();

    // フォーム送信処理
    if (form) {
        form.addEventListener('submit', function (e) {
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();

            if (!email || !password) {
                e.preventDefault();
                showValidationError('Please enter both email and password');
                return;
            }

            // 簡単なメール形式チェック
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                e.preventDefault();
                showValidationError('Please enter a valid email address');
                return;
            }

            showLoadingState();
        });
    }

    // 入力フィールドの検証
    [emailInput, passwordInput].forEach(input => {
        if (input) {
            input.addEventListener('input', function() {
                clearInputError(this);
                clearMessages();
            });
        }
    });

    // 最初の空のフィールドにフォーカス
    if (emailInput && !emailInput.value) {
        emailInput.focus();
    } else if (passwordInput && !passwordInput.value) {
        passwordInput.focus();
    }

    // デモアカウント機能
    initializeDemoAccounts();

    // キーボードショートカット
    document.addEventListener('keydown', function (e) {
        // Alt + A for admin
        if (e.altKey && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            const adminAccount = document.querySelector('.demo-account[data-email*="admin"]');
            if (adminAccount) {
                fillCredentials(
                    adminAccount.dataset.email,
                    adminAccount.dataset.password,
                    'Administrator'
                );
            }
        }
        // Alt + U for user
        if (e.altKey && e.key.toLowerCase() === 'u') {
            e.preventDefault();
            const userAccount = document.querySelector('.demo-account:not([data-email*="admin"])');
            if (userAccount) {
                fillCredentials(
                    userAccount.dataset.email,
                    userAccount.dataset.password,
                    'User'
                );
            }
        }
    });

    // 二重送信防止
    if (form) {
        form.addEventListener('submit', function () {
            setTimeout(() => {
                if (submitButton) {
                    submitButton.disabled = true;
                }
            }, 100);
        });
    }

    // =============================
    // デモアカウント機能
    // =============================

    function initializeDemoAccounts() {
        // デモアカウントカードのクリックイベント
        document.querySelectorAll('.demo-account').forEach(account => {
            account.addEventListener('click', function() {
                const email = this.dataset.email;
                const password = this.dataset.password;
                const accountType = email.includes('admin') ? 'Administrator' : 'User';
                
                // ビジュアルフィードバック
                this.classList.add('clicked');
                setTimeout(() => {
                    this.classList.remove('clicked');
                    this.classList.add('success');
                    setTimeout(() => {
                        this.classList.remove('success');
                    }, 1500);
                }, 150);
                
                fillCredentials(email, password, accountType);
            });
        });

        // デモボタンのクリックイベント
        document.querySelectorAll('.demo-btn').forEach(button => {
            button.addEventListener('click', function(e) {
                e.stopPropagation();
                
                const account = this.closest('.demo-account');
                const email = account.dataset.email;
                const password = account.dataset.password;
                const accountType = email.includes('admin') ? 'Administrator' : 'User';
                
                // ボタンフィードバック
                this.classList.add('success');
                this.textContent = '✓';
                setTimeout(() => {
                    this.classList.remove('success');
                    this.textContent = 'Use';
                }, 1000);
                
                fillCredentials(email, password, accountType);
            });
        });

        // 認証情報の個別クリック
        document.querySelectorAll('.demo-credentials').forEach(credentials => {
            credentials.addEventListener('click', function (e) {
                e.stopPropagation();

                const account = this.closest('.demo-account');
                const email = account.dataset.email;
                const password = account.dataset.password;

                // ビジュアルフィードバック
                this.style.backgroundColor = '#deecf9';
                setTimeout(() => {
                    this.style.backgroundColor = '';
                }, 300);

                // 認証情報をコピー
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(`${email} / ${password}`);
                    showTooltip(this, 'Credentials copied!');
                }

                fillCredentials(email, password, 'Credentials');
            });
        });
    }

    // 認証情報自動入力
    function fillCredentials(email, password, accountType) {
        if (emailInput && passwordInput) {
            emailInput.value = email;
            passwordInput.value = password;
            
            // エラーをクリア
            clearInputError(emailInput);
            clearInputError(passwordInput);
            
            // 成功メッセージ
            showSuccessMessage(`${accountType} credentials loaded`);
            
            // 送信ボタンにフォーカス
            if (submitButton) {
                submitButton.focus();
            }
        }
    }

    function showTooltip(element, text) {
        const tooltip = document.createElement('div');
        tooltip.textContent = text;
        tooltip.style.cssText = `
            position: absolute;
            background: #323130;
            color: white;
            padding: 4px 8px;
            border-radius: 2px;
            font-size: 11px;
            z-index: 1000;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
        `;

        document.body.appendChild(tooltip);

        const rect = element.getBoundingClientRect();
        tooltip.style.left = rect.left + 'px';
        tooltip.style.top = (rect.top - 25) + 'px';

        requestAnimationFrame(() => {
            tooltip.style.opacity = '1';
        });

        setTimeout(() => {
            tooltip.remove();
        }, 1200);
    }

    // =============================
    // ユーティリティ関数
    // =============================

    function resetButtonState() {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Sign In';
            submitButton.style.opacity = '';
        }
    }

    function clearURLParameters() {
        if (window.history.replaceState) {
            const url = new URL(window.location);
            let hasParams = false;

            ['error', 'message'].forEach(param => {
                if (url.searchParams.has(param)) {
                    url.searchParams.delete(param);
                    hasParams = true;
                }
            });

            if (hasParams) {
                const newUrl = url.pathname + (url.search ? url.search : '');
                window.history.replaceState(null, null, newUrl);
            }
        }
    }

    function clearInputError(input) {
        input.style.borderColor = '';
        input.style.boxShadow = '';
    }

    function clearMessages() {
        const existingAlerts = messageArea.querySelectorAll('.alert');
        existingAlerts.forEach(alert => alert.remove());
    }

    function showValidationError(message) {
        clearMessages();

        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-error';
        alertDiv.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/>
            </svg>
            ${message}
        `;

        messageArea.appendChild(alertDiv);

        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 4000);
    }

    function showSuccessMessage(message) {
        clearMessages();

        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-info';
        alertDiv.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
            </svg>
            ${message}
        `;

        messageArea.appendChild(alertDiv);

        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 2500);
    }

    function showLoadingState() {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Signing in...';
            submitButton.style.opacity = '0.8';
        }
    }

    // 入力中にメッセージをクリア
    [emailInput, passwordInput].forEach(input => {
        if (input) {
            input.addEventListener('input', clearMessages);
        }
    });
});