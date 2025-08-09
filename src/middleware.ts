import { defineMiddleware } from 'astro:middleware';
import type { APIContext } from 'astro';

export const onRequest = defineMiddleware(async (context: APIContext, next) => {
    const url = new URL(context.request.url);
    
    // Skip middleware for API routes
    if (url.pathname.startsWith('/api/')) {
        return next();
    }
    
    // Skip middleware for static assets
    if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
        return next();
    }
    
    // For custom pages that aren't part of Starlight, ensure we don't interfere
    // with Starlight's middleware expectations
    const customRoutes = [
        '/mock-auth/',
        '/en/changelogs',
        '/ar/changelogs'
    ];
    
    const isCustomRoute = customRoutes.some(route => url.pathname.includes(route));
    
    if (isCustomRoute) {
        // For custom routes, we need to be careful not to conflict with Starlight
        // Let's ensure the response continues normally
        try {
            return await next();
        } catch (error) {
            console.error('Error in custom route middleware:', error);
            // Continue with the request even if there's an error
            return next();
        }
    }
    
    // For all other routes, continue normally (likely Starlight routes)
    return next();
});