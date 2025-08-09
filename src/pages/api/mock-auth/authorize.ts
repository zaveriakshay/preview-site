import type { APIRoute } from 'astro';
import { authConfigManager } from '../../../utils/auth-config.ts';

export const prerender = false;

export const GET: APIRoute = async ({ url, redirect }) => {
    try {
        const authConfig = await authConfigManager.loadConfig();
        
        // Only enable mock auth in local environment
        if (authConfig.environment !== 'local') {
            return new Response('Mock authentication is only available in local environment', {
                status: 400,
                headers: { 'Content-Type': 'text/plain' }
            });
        }

        const searchParams = url.searchParams;
        const response_type = searchParams.get('response_type');
        const client_id = searchParams.get('client_id');
        const redirect_uri = searchParams.get('redirect_uri');
        const state = searchParams.get('state');
        const scope = searchParams.get('scope');
        const nonce = searchParams.get('nonce');

        // Validate required parameters
        if (!response_type || response_type !== 'code') {
            return new Response('Unsupported response type', {
                status: 400,
                headers: { 'Content-Type': 'text/plain' }
            });
        }

        if (!client_id || client_id !== authConfig.keycloak.clientId) {
            return new Response('Invalid client ID', {
                status: 400,
                headers: { 'Content-Type': 'text/plain' }
            });
        }

        if (!redirect_uri) {
            return new Response('Missing redirect URI', {
                status: 400,
                headers: { 'Content-Type': 'text/plain' }
            });
        }

        // Store auth request params for the auth page
        const authParams = {
            client_id,
            redirect_uri,
            state,
            scope,
            nonce,
            response_type
        };

        // Redirect to mock login page with parameters
        const authPageUrl = new URL('/mock-auth/auth', url.origin);
        authPageUrl.searchParams.set('params', btoa(JSON.stringify(authParams)));
        
        return redirect(authPageUrl.toString(), 302);

    } catch (error) {
        console.error('Mock auth authorize error:', error);
        return new Response('Internal server error', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
};