import type { AstroGlobal } from 'astro';

/**
 * Check if an error is an AstroError that we can safely ignore
 */
export function isIgnorableAstroError(error: any): boolean {
    // Check if it's an AstroError related to Starlight routing
    if (error && typeof error === 'object') {
        const errorMessage = error.message || '';
        const errorName = error.name || '';
        
        // Common Starlight routing errors that are safe to ignore for custom routes
        const ignorableErrors = [
            'starlightRoute',
            'locals.starlightRoute',
            'route-data',
            'StarlightRouteData'
        ];
        
        return ignorableErrors.some(pattern => 
            errorMessage.includes(pattern) || errorName.includes(pattern)
        );
    }
    
    return false;
}

/**
 * Safely check if we're in a Starlight context
 * This helps avoid middleware conflicts with custom routes
 */
export function isStarlightRoute(Astro: AstroGlobal): boolean {
    try {
        // Check for custom routes that should never be Starlight routes
        const pathname = Astro.url.pathname;
        
        // API routes are never Starlight routes
        if (pathname.startsWith('/api/')) {
            return false;
        }
        
        // Mock auth routes are never Starlight routes
        if (pathname.includes('/mock-auth/')) {
            return false;
        }
        
        // Static assets are never Starlight routes
        if (pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
            return false;
        }
        
        // Check if we have Starlight locals
        if (!Astro.locals || typeof Astro.locals !== 'object') {
            return false;
        }
        
        // Check for starlightRoute property
        if (!('starlightRoute' in Astro.locals)) {
            return false;
        }
        
        // Additional validation that the starlightRoute is valid
        const starlightRoute = Astro.locals.starlightRoute;
        if (!starlightRoute || typeof starlightRoute !== 'object') {
            return false;
        }
        
        return true;
        
    } catch (error) {
        // If anything goes wrong, assume we're not in a Starlight context
        console.debug('Error checking Starlight route:', error);
        return false;
    }
}

/**
 * Safely get Starlight route data
 */
export function getStarlightRouteData(Astro: AstroGlobal) {
    try {
        if (isStarlightRoute(Astro)) {
            return Astro.locals.starlightRoute;
        }
        return null;
    } catch (error) {
        console.debug('Error getting Starlight route data:', error);
        return null;
    }
}