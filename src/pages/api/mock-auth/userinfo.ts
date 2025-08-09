import type { APIRoute } from 'astro';
import { authConfigManager } from '../../../utils/auth-config.ts';

export const prerender = false;

function parseMockToken(token: string) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        
        const payload = JSON.parse(atob(parts[1]));
        return payload;
    } catch (error) {
        return null;
    }
}

export const GET: APIRoute = async ({ request }) => {
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

        const authHeader = request.headers.get('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(JSON.stringify({
                error: 'invalid_token',
                error_description: 'No access token provided'
            }), {
                status: 401,
                headers: { 
                    'Content-Type': 'application/json',
                    'WWW-Authenticate': 'Bearer'
                }
            });
        }

        const token = authHeader.substring(7);
        const payload = parseMockToken(token);

        if (!payload) {
            return new Response(JSON.stringify({
                error: 'invalid_token',
                error_description: 'Invalid token format'
            }), {
                status: 401,
                headers: { 
                    'Content-Type': 'application/json',
                    'WWW-Authenticate': 'Bearer'
                }
            });
        }

        // Check token expiration
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            return new Response(JSON.stringify({
                error: 'invalid_token',
                error_description: 'Token has expired'
            }), {
                status: 401,
                headers: { 
                    'Content-Type': 'application/json',
                    'WWW-Authenticate': 'Bearer'
                }
            });
        }

        if (authConfig.debug.enabled) {
            console.log('Mock userinfo request for user:', payload.preferred_username);
        }

        // Return user info in OpenID Connect format
        const userInfo = {
            sub: payload.sub,
            preferred_username: payload.preferred_username,
            email: payload.email,
            email_verified: payload.email_verified,
            given_name: payload.given_name,
            family_name: payload.family_name,
            name: payload.name,
            realm_access: payload.realm_access,
            resource_access: payload.resource_access
        };

        return new Response(JSON.stringify(userInfo), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
                'Pragma': 'no-cache'
            }
        });

    } catch (error) {
        console.error('Mock userinfo error:', error);
        
        return new Response(JSON.stringify({
            error: 'server_error',
            error_description: 'Internal server error'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};