import express from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SSO_AUTH_SERVER = process.env.SSO_AUTH_SERVER || 'http://localhost:3303';

// RSA鍵のキャッシュ
let privateKey = null;
let publicKey = null;

// RSA秘密鍵を取得
function getPrivateKey() {
    if (privateKey) {
        return privateKey;
    }

    try {
        const privateKeyPath = path.join(__dirname, '../keys/private.pem');
        if (fs.existsSync(privateKeyPath)) {
            privateKey = fs.readFileSync(privateKeyPath, 'utf8');
            return privateKey;
        }

        if (process.env.JWT_PRIVATE_KEY) {
            privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
            return privateKey;
        }

        throw new Error('RSA秘密鍵が見つかりません');
    } catch (error) {
        console.error('RSA秘密鍵取得エラー:', error.message);
        throw new Error('RSA秘密鍵の取得に失敗しました');
    }
}

// RSA公開鍵を取得
function getPublicKey() {
    if (publicKey) {
        return publicKey;
    }

    try {
        const publicKeyPath = path.join(__dirname, '../keys/public.pem');
        if (fs.existsSync(publicKeyPath)) {
            publicKey = fs.readFileSync(publicKeyPath, 'utf8');
            return publicKey;
        }

        if (process.env.JWT_PUBLIC_KEY) {
            publicKey = process.env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');
            return publicKey;
        }

        throw new Error('RSA公開鍵が見つかりません');
    } catch (error) {
        console.error('RSA公開鍵取得エラー:', error.message);
        throw new Error('RSA公開鍵の取得に失敗しました');
    }
}

// 認証状態確認
router.get('/status', (req, res) => {
    console.log('認証状態チェック (RS256) - Cookie情報:', {
        hasCookies: !!req.cookies,
        cookieKeys: req.cookies ? Object.keys(req.cookies) : [],
        hasSessionToken: !!(req.cookies && req.cookies.session_token)
    });

    const sessionToken = req.cookies && req.cookies.session_token;

    if (!sessionToken) {
        return res.json({
            authenticated: false,
            message: 'No session token found',
            algorithm: 'RS256',
            debug: {
                hasCookies: !!req.cookies,
                cookieCount: req.cookies ? Object.keys(req.cookies).length : 0
            }
        });
    }

    try {
        const rsaPublicKey = getPublicKey();

        const decoded = jwt.verify(sessionToken, rsaPublicKey, {
            algorithms: ['RS256'],
            issuer: SSO_AUTH_SERVER,
            audience: SSO_AUTH_SERVER
        });

        const { userInfo, tokens } = decoded;

        // トークンの有効期限チェック
        const isExpired = tokens.expires_at < Date.now();
        const timeUntilExpiry = Math.max(0, tokens.expires_at - Date.now());

        res.json({
            authenticated: true,
            user: userInfo,
            tokenExpired: isExpired,
            expiresAt: new Date(tokens.expires_at).toISOString(),
            timeUntilExpiry: timeUntilExpiry,
            needsRefresh: timeUntilExpiry < 5 * 60 * 1000, // 5分以内に期限切れ
            algorithm: 'RS256'
        });

    } catch (error) {
        console.error('Auth status check error (RS256):', {
            error: error.message,
            name: error.name
        });

        // 不正なトークンの場合はCookieをクリア
        res.clearCookie('session_token');

        res.json({
            authenticated: false,
            error: error.message,
            tokenCleared: true,
            algorithm: 'RS256'
        });
    }
});

// ログイン（OAuth認証にリダイレクト）
router.get('/login', (req, res) => {
    const returnUrl = req.query.returnUrl || '/';
    const loginUrl = `/oauth/login?returnUrl=${encodeURIComponent(returnUrl)}`;

    res.json({
        message: 'Redirect to OAuth login',
        loginUrl: loginUrl,
        ssoAuthServer: SSO_AUTH_SERVER,
        algorithm: 'RS256'
    });
});

// ログアウト
router.post('/logout', (req, res) => {
    const sessionToken = req.cookies.session_token;

    // Cookieをクリア
    res.clearCookie('session_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    });

    // セッショントークンが存在した場合はユーザー情報を取得
    let userInfo = null;
    if (sessionToken) {
        try {
            const rsaPublicKey = getPublicKey();
            const decoded = jwt.verify(sessionToken, rsaPublicKey, {
                algorithms: ['RS256'],
                issuer: SSO_AUTH_SERVER,
                audience: SSO_AUTH_SERVER
            });
            userInfo = decoded.userInfo;
        } catch (error) {
            // トークンが無効でも気にしない
        }
    }

    console.log('User logged out (RS256):', {
        employeeId: userInfo?.preferred_username || 'unknown',
        email: userInfo?.email || 'unknown',
        timestamp: new Date().toISOString(),
        algorithm: 'RS256'
    });

    res.json({
        success: true,
        message: 'Logged out successfully',
        timestamp: new Date().toISOString(),
        algorithm: 'RS256'
    });
});

// セッション延長
router.post('/extend', (req, res) => {
    const sessionToken = req.cookies && req.cookies.session_token;

    if (!sessionToken) {
        return res.status(401).json({
            error: 'No session found',
            message: 'No session token to extend',
            algorithm: 'RS256'
        });
    }

    try {
        const rsaPublicKey = getPublicKey();
        const rsaPrivateKey = getPrivateKey();

        const decoded = jwt.verify(sessionToken, rsaPublicKey, {
            algorithms: ['RS256'],
            issuer: SSO_AUTH_SERVER,
            audience: SSO_AUTH_SERVER
        });

        // 新しいセッショントークンを生成（24時間延長）
        const newSessionToken = jwt.sign(
            {
                userInfo: decoded.userInfo,
                tokens: decoded.tokens
            },
            rsaPrivateKey,
            {
                expiresIn: '24h',
                algorithm: 'RS256',
                issuer: SSO_AUTH_SERVER,
                audience: SSO_AUTH_SERVER
            }
        );

        // 新しいCookieを設定
        res.cookie('session_token', newSessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24時間
        });

        res.json({
            success: true,
            message: 'Session extended successfully',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            algorithm: 'RS256'
        });

    } catch (error) {
        console.error('Session extend error (RS256):', error.message);

        res.status(401).json({
            error: 'Session extension failed',
            message: error.message,
            algorithm: 'RS256'
        });
    }
});

// ユーザー情報取得（認証必須）
router.get('/user', (req, res) => {
    const sessionToken = req.cookies && req.cookies.session_token;

    if (!sessionToken) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'No session token provided',
            algorithm: 'RS256'
        });
    }

    try {
        const rsaPublicKey = getPublicKey();

        const decoded = jwt.verify(sessionToken, rsaPublicKey, {
            algorithms: ['RS256'],
            issuer: SSO_AUTH_SERVER,
            audience: SSO_AUTH_SERVER
        });

        const { userInfo, tokens } = decoded;

        // トークンの有効期限チェック
        if (tokens.expires_at < Date.now()) {
            return res.status(401).json({
                error: 'Token Expired',
                message: 'Session has expired',
                action: 'refresh_required',
                algorithm: 'RS256'
            });
        }

        // employeeIdをメールアドレスベースに統一
        const employeeId = userInfo.email || userInfo.preferred_username || userInfo.sub;

        res.json({
            user: {
                ...userInfo,
                employeeId: employeeId
            },
            tokenInfo: {
                expiresAt: new Date(tokens.expires_at).toISOString(),
                scope: tokens.scope
            },
            algorithm: 'RS256',
            debug: {
                originalEmployeeId: userInfo.preferred_username || userInfo.sub,
                emailBasedEmployeeId: employeeId,
                idSource: userInfo.email ? 'email' : (userInfo.preferred_username ? 'preferred_username' : 'sub')
            }
        });

    } catch (error) {
        console.error('User info fetch error (RS256):', error.message);

        res.status(401).json({
            error: 'Authentication failed',
            message: error.message,
            algorithm: 'RS256'
        });
    }
});

// デバッグ情報（開発環境のみ）
if (process.env.NODE_ENV !== 'production') {
    router.get('/debug', (req, res) => {
        const sessionToken = req.cookies && req.cookies.session_token;

        let debugInfo = {
            hasSessionToken: !!sessionToken,
            hasCookies: !!req.cookies,
            cookies: req.cookies || {},
            cookieCount: req.cookies ? Object.keys(req.cookies).length : 0,
            headers: {
                authorization: req.get('Authorization'),
                userAgent: req.get('User-Agent'),
                origin: req.get('Origin'),
                referer: req.get('Referer'),
                cookie: req.get('Cookie')
            },
            environment: {
                nodeEnv: process.env.NODE_ENV,
                ssoAuthServer: SSO_AUTH_SERVER,
                oauthClientId: process.env.OAUTH_CLIENT_ID
            },
            algorithm: 'RS256',
            keys: {
                hasPrivateKey: !!getPrivateKeyPath(),
                hasPublicKey: !!getPublicKeyPath(),
                privateKeyPath: getPrivateKeyPath(),
                publicKeyPath: getPublicKeyPath()
            }
        };

        if (sessionToken) {
            try {
                const decoded = jwt.decode(sessionToken);
                debugInfo.tokenPayload = {
                    ...decoded,
                    // セキュリティのため実際のトークンは表示しない
                    tokens: decoded.tokens ? {
                        hasAccessToken: !!decoded.tokens.access_token,
                        hasIdToken: !!decoded.tokens.id_token,
                        hasRefreshToken: !!decoded.tokens.refresh_token,
                        expiresAt: decoded.tokens.expires_at
                    } : null
                };
            } catch (error) {
                debugInfo.tokenError = error.message;
            }
        }

        res.json(debugInfo);
    });

    function getPrivateKeyPath() {
        const privateKeyPath = path.join(__dirname, '../keys/private.pem');
        return fs.existsSync(privateKeyPath) ? privateKeyPath : null;
    }

    function getPublicKeyPath() {
        const publicKeyPath = path.join(__dirname, '../keys/public.pem');
        return fs.existsSync(publicKeyPath) ? publicKeyPath : null;
    }
}

export default router;