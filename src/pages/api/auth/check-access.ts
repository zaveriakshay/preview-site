import type { APIRoute } from 'astro';
import { authConfigManager } from '../../../utils/auth-config.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
    try {
        const { path, roles = [] } = await request.json();
        
        if (!path) {
            return new Response(JSON.stringify({
                error: 'Path is required'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const visibilityCheck = await authConfigManager.checkPageVisibility(path, roles);
        
        return new Response(JSON.stringify(visibilityCheck), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
        
    } catch (error) {
        console.error('Auth check API error:', error);
        
        return new Response(JSON.stringify({
            error: 'Internal server error',
            visible: false,
            requiresAuth: true
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};