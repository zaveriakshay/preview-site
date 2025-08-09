import { getCollection } from 'astro:content';

export interface VersionInfo {
    version: string;
    label: string;
    badge?: string;
    description?: string;
}

/**
 * Dynamically detect available versions for a specific language and guide type
 * from the content collection structure
 */
export async function getAvailableVersions(
    language: string = 'en',
    guideType?: string
): Promise<VersionInfo[]> {
    try {
        const docs = await getCollection('docs');
        const versionSet = new Set<string>();

        // Extract versions from the docs collection
        docs.forEach(doc => {
            const pathParts = doc.id.split('/');
            
            // Expected structure: language/guides/guideType/version/...
            if (pathParts[0] === language && pathParts[1] === 'guides') {
                if (!guideType || pathParts[2] === guideType) {
                    const version = pathParts[3];
                    if (version && version.match(/^v\d+$/)) {
                        versionSet.add(version);
                    }
                }
            }
        });

        // Convert to array and sort by version number
        const versions = Array.from(versionSet).sort((a, b) => {
            const aNum = parseInt(a.substring(1));
            const bNum = parseInt(b.substring(1));
            return bNum - aNum; // Sort descending (latest first)
        });

        // Map to VersionInfo objects with metadata
        return versions.map((version, index) => ({
            version,
            label: index === 0 ? `${version} (Latest)` : version,
            badge: index === 0 ? 'Latest' : (index === versions.length - 1 ? 'Legacy' : undefined),
            description: index === 0 
                ? 'Current stable version with latest features'
                : index === versions.length - 1
                    ? 'Legacy version - consider upgrading'
                    : 'Stable version'
        }));

    } catch (error) {
        console.error('Error detecting versions:', error);
        // Fallback to default versions
        return [
            {
                version: 'v2',
                label: 'v2 (Latest)',
                badge: 'Latest',
                description: 'Current stable version with latest features'
            },
            {
                version: 'v1',
                label: 'v1',
                badge: 'Legacy',
                description: 'Legacy version - consider upgrading'
            }
        ];
    }
}

/**
 * Extract current language, guide type, and version from a URL path
 */
export function parseCurrentPath(pathname: string) {
    // Expected path structure: /language/guides/guideType/version/...
    const pathParts = pathname.split('/').filter(Boolean);
    
    return {
        language: pathParts[0] || 'en',
        guideType: pathParts[2] || null, // might be 'mobile', 'web', etc.
        version: pathParts[3] || 'v2',
        fullPath: pathname
    };
}

/**
 * Generate a new path with a different version while maintaining
 * the same language, guide type, and page structure
 */
export function generateVersionPath(currentPath: string, newVersion: string): string {
    const pathParts = currentPath.split('/').filter(Boolean);
    
    if (pathParts.length >= 4) {
        // Replace the version part (index 3)
        pathParts[3] = newVersion;
        return '/' + pathParts.join('/');
    }
    
    // Fallback: simple replacement
    return currentPath.replace(/\/v\d+\//, `/${newVersion}/`);
}

/**
 * Check if a specific version exists for the current guide type and language
 */
export async function checkVersionExists(
    language: string,
    guideType: string,
    version: string,
    currentPage?: string
): Promise<boolean> {
    try {
        const docs = await getCollection('docs');
        const targetPath = currentPage 
            ? `${language}/guides/${guideType}/${version}/${currentPage}`
            : `${language}/guides/${guideType}/${version}`;

        return docs.some(doc => 
            doc.id.startsWith(targetPath) || 
            doc.id === `${language}/guides/${guideType}/${version}/index`
        );
    } catch (error) {
        console.error('Error checking version existence:', error);
        return true; // Assume it exists to avoid breaking navigation
    }
}