import type { APIRoute } from 'astro';
import { authConfigManager } from '../../../utils/auth-config.ts';

export const prerender = false;

interface MockUser {
    id: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
}

const mockUsers: MockUser[] = [
    {
        id: '1',
        username: 'john.doe',
        email: 'john.doe@noqodi.com',
        firstName: 'John',
        lastName: 'Doe',
        roles: ['PAYMENT_USER', 'API_CONSUMER', 'MEMBER']
    },
    {
        id: '2',
        username: 'jane.admin',
        email: 'jane.admin@noqodi.com',
        firstName: 'Jane',
        lastName: 'Admin',
        roles: ['PAYMENT_USER', 'PAYMENT_CREATE', 'PAYMENT_REFUND', 'MERCHANT_ADMIN', 'ENTERPRISE_USER', 'ADMIN']
    },
    {
        id: '3',
        username: 'test.user',
        email: 'test.user@example.com',
        firstName: 'Test',
        lastName: 'User',
        roles: ['MEMBER']
    },
    {
        id: '4',
        username: 'merchant.user',
        email: 'merchant@business.com',
        firstName: 'Merchant',
        lastName: 'User',
        roles: ['MERCHANT_USER', 'PAYMENT_USER', 'API_CONSUMER']
    },
    {
        id: 'fail',
        username: 'fail.test',
        email: 'fail@example.com',
        firstName: 'Fail',
        lastName: 'Test',
        roles: ['MEMBER']
    },
    {
        id: 'expired',
        username: 'expired.test',
        email: 'expired@example.com',
        firstName: 'Expired',
        lastName: 'Test',
        roles: ['MEMBER']
    }
];

function generateMockToken(user: MockUser): string {
    const header = {
        alg: 'RS256',
        typ: 'JWT',
        kid: 'mock-key-id'
    };

    const payload = {
        sub: user.id,
        iss: 'http://localhost:4321/api/mock-auth',
        aud: 'ums-client',
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
        iat: Math.floor(Date.now() / 1000),
        auth_time: Math.floor(Date.now() / 1000),
        jti: Math.random().toString(36).substring(2),
        preferred_username: user.username,
        email: user.email,
        email_verified: true,
        given_name: user.firstName,
        family_name: user.lastName,
        name: `${user.firstName} ${user.lastName}`,
        realm_access: {
            roles: user.roles
        },
        resource_access: {
            'ums-client': {
                roles: user.roles
            }
        },
        scope: 'openid email profile',
        session_state: Math.random().toString(36).substring(2),
        typ: 'Bearer'
    };

    // Simple base64 encoding for mock purposes (not secure for production)
    const encodedHeader = btoa(JSON.stringify(header));
    const encodedPayload = btoa(JSON.stringify(payload));
    const signature = 'mock-signature-' + Math.random().toString(36).substring(2);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export const POST: APIRoute = async ({ request }) => {
    try {
        const authConfig = await authConfigManager.loadConfig();
        
        // Only enable mock auth in local environment
        if (authConfig.environment !== 'local') {
            return new Response(JSON.stringify({
                error: 'invalid_request',
                error_description: 'Mock authentication is only available in local environment'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const contentType = request.headers.get('content-type');
        let body: any;

        if (contentType?.includes('application/x-www-form-urlencoded')) {
            const formData = await request.formData();
            body = Object.fromEntries(formData);
        } else {
            body = await request.json();
        }

        const { grant_type, code, refresh_token, client_id } = body;

        if (client_id !== authConfig.keycloak.clientId) {
            return new Response(JSON.stringify({
                error: 'invalid_client',
                error_description: 'Invalid client credentials'
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (grant_type === 'authorization_code') {
            // Extract user ID from mock authorization code
            const userId = code?.replace('mock-auth-code-', '') || '1';
            
            // Handle failure scenarios
            if (userId === 'fail') {
                return new Response(JSON.stringify({
                    error: 'access_denied',
                    error_description: 'Authentication failed - invalid credentials'
                }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            if (userId === 'expired') {
                return new Response(JSON.stringify({
                    error: 'invalid_grant',
                    error_description: 'Authorization code has expired'
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // Handle invalid code format
            if (!code || !code.startsWith('mock-auth-code-')) {
                return new Response(JSON.stringify({
                    error: 'invalid_grant',
                    error_description: 'Invalid authorization code format'
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            
            const user = mockUsers.find(u => u.id === userId) || mockUsers[0];
            
            const accessToken = generateMockToken(user);
            const refreshToken = `mock-refresh-token-${user.id}-${Date.now()}`;

            if (authConfig.debug.enabled) {
                console.log('Mock token exchange for user:', user.username);
            }

            return new Response(JSON.stringify({
                access_token: accessToken,
                expires_in: 3600,
                refresh_expires_in: 7200,
                refresh_token: refreshToken,
                token_type: 'Bearer',
                id_token: accessToken, // Using same token for simplicity
                'not-before-policy': 0,
                session_state: Math.random().toString(36).substring(2),
                scope: 'openid email profile'
            }), {
                status: 200,
                headers: { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store',
                    'Pragma': 'no-cache'
                }
            });

        } else if (grant_type === 'refresh_token') {
            // Extract user ID from refresh token
            const tokenParts = refresh_token?.split('-');
            const userId = tokenParts?.[3] || '1';
            const user = mockUsers.find(u => u.id === userId) || mockUsers[0];
            
            const newAccessToken = generateMockToken(user);
            const newRefreshToken = `mock-refresh-token-${user.id}-${Date.now()}`;

            if (authConfig.debug.enabled) {
                console.log('Mock token refresh for user:', user.username);
            }

            return new Response(JSON.stringify({
                access_token: newAccessToken,
                expires_in: 3600,
                refresh_expires_in: 7200,
                refresh_token: newRefreshToken,
                token_type: 'Bearer',
                id_token: newAccessToken,
                'not-before-policy': 0,
                session_state: Math.random().toString(36).substring(2),
                scope: 'openid email profile'
            }), {
                status: 200,
                headers: { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store',
                    'Pragma': 'no-cache'
                }
            });

        } else {
            return new Response(JSON.stringify({
                error: 'unsupported_grant_type',
                error_description: 'Grant type not supported'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

    } catch (error) {
        console.error('Mock auth token error:', error);
        
        return new Response(JSON.stringify({
            error: 'server_error',
            error_description: 'Internal server error'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};