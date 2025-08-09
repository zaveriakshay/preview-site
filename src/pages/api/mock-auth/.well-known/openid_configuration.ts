import type { APIRoute } from 'astro';
import { authConfigManager } from '../../../../utils/auth-config.ts';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
    try {
        const authConfig = await authConfigManager.loadConfig();
        
        // Only enable mock auth in local environment
        if (authConfig.environment !== 'local') {
            return new Response(JSON.stringify({
                error: 'Mock authentication is only available in local environment'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const baseUrl = `${url.protocol}//${url.host}`;
        
        const config = {
            issuer: `${baseUrl}/api/mock-auth`,
            authorization_endpoint: `${baseUrl}/api/mock-auth/authorize`,
            token_endpoint: `${baseUrl}/api/mock-auth/token`,
            userinfo_endpoint: `${baseUrl}/api/mock-auth/userinfo`,
            introspection_endpoint: `${baseUrl}/api/mock-auth/introspect`,
            end_session_endpoint: `${baseUrl}/api/mock-auth/logout`,
            jwks_uri: `${baseUrl}/api/mock-auth/jwks`,
            check_session_iframe: `${baseUrl}/api/mock-auth/session/iframe`,
            
            grant_types_supported: [
                'authorization_code',
                'refresh_token'
            ],
            
            response_types_supported: [
                'code'
            ],
            
            subject_types_supported: [
                'public'
            ],
            
            id_token_signing_alg_values_supported: [
                'RS256'
            ],
            
            scopes_supported: [
                'openid',
                'profile',
                'email',
                'roles'
            ],
            
            token_endpoint_auth_methods_supported: [
                'client_secret_basic',
                'client_secret_post'
            ],
            
            claims_supported: [
                'sub',
                'iss',
                'aud',
                'exp',
                'iat',
                'auth_time',
                'nonce',
                'email',
                'email_verified',
                'name',
                'given_name',
                'family_name',
                'preferred_username',
                'realm_access'
            ],
            
            code_challenge_methods_supported: [
                'S256',
                'plain'
            ],
            
            tls_client_certificate_bound_access_tokens: false
        };

        return new Response(JSON.stringify(config, null, 2), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=86400'
            }
        });

    } catch (error) {
        console.error('Mock OpenID configuration error:', error);
        
        return new Response(JSON.stringify({
            error: 'server_error',
            error_description: 'Internal server error'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};