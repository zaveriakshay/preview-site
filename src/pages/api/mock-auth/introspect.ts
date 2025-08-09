import type { APIRoute } from 'astro';
import { authConfigManager } from '../../../utils/auth-config.ts';

export const prerender = false;

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

        const { token, token_type_hint } = body;

        if (!token) {
            return new Response(JSON.stringify({
                active: false
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // For mock purposes, check if it looks like our token format
        if (token.startsWith('eyJ') && token.includes('.')) {
            try {
                // Decode the payload (second part of JWT)
                const parts = token.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1]));
                    
                    // Check if token is expired
                    const now = Math.floor(Date.now() / 1000);
                    const isExpired = payload.exp && payload.exp < now;
                    
                    if (isExpired) {
                        return new Response(JSON.stringify({
                            active: false
                        }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }

                    // Return token introspection data
                    return new Response(JSON.stringify({
                        active: true,
                        sub: payload.sub,
                        username: payload.preferred_username,
                        email: payload.email,
                        scope: payload.scope,
                        client_id: payload.aud,
                        token_type: 'Bearer',
                        exp: payload.exp,
                        iat: payload.iat,
                        iss: payload.iss,
                        realm_access: payload.realm_access
                    }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            } catch (error) {
                // Invalid token format
            }
        }

        // Invalid token
        return new Response(JSON.stringify({
            active: false
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Mock auth introspect error:', error);
        
        return new Response(JSON.stringify({
            error: 'server_error',
            error_description: 'Internal server error'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};