import { parse } from 'yaml';

export interface ApiVersionInfo {
    version: string;
    label: string;
    badge?: string;
    description?: string;
    specExists: boolean;
}

export interface ApiPathInfo {
    serviceName: string | null;
    operationId: string | null;
    version: string;
    language: string;
}

const versionCache = new Map<string, ApiVersionInfo[]>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Parse API path to extract service name, operation ID, version and language
 * Expected formats:
 * - /api/payment-api
 * - /api/payment-api/operation-id  
 * - /api/payment-api?lang=ar
 * - /api/payment-api/operation-id?lang=ar
 */
export function parseApiPath(pathname: string): ApiPathInfo {
    const pathParts = pathname.split('/').filter(Boolean);
    const urlParams = new URLSearchParams(pathname.split('?')[1] || '');
    
    return {
        serviceName: pathParts[1] || null, // after /api/
        operationId: pathParts[2] || null, // after service name
        version: 'v2', // Default version, will be determined dynamically
        language: urlParams.get('lang') || 'en'
    };
}

/**
 * Get available versions for a specific API service by scanning the file system
 */
export async function getApiVersions(serviceName: string, language: string = 'en'): Promise<ApiVersionInfo[]> {
    const cacheKey = `${serviceName}-${language}`;
    
    // Check cache first
    if (versionCache.has(cacheKey)) {
        const cached = versionCache.get(cacheKey)!;
        return cached;
    }

    try {
        console.log(`Detecting API versions for service: ${serviceName}, language: ${language}`);
        
        const versions: ApiVersionInfo[] = [];
        const versionSet = new Set<string>();
        
        // Use import.meta.glob to scan for versioned API specs
        const yamlModules = import.meta.glob('/src/content/docs/*/apispecs/*/*/*.{yaml,yml}', {
            query: '?raw',
            import: 'default',
            eager: true
        });
        
        console.log(`Found ${Object.keys(yamlModules).length} total versioned API files`);
        
        // Filter for the specific service and language
        const serviceFiles = Object.entries(yamlModules).filter(([path]) => 
            path.includes(`/docs/${language}/apispecs/${serviceName}/`)
        );
        
        console.log(`Found ${serviceFiles.length} files for service ${serviceName} in language ${language}`);
        
        for (const [filePath, fileContent] of serviceFiles) {
            try {
                // Extract version from path: /src/content/docs/en/apispecs/payment-api/v2/spec.yaml
                const pathMatch = filePath.match(/\/apispecs\/[^\/]+\/([^\/]+)\//);
                if (!pathMatch) continue;
                
                const version = pathMatch[1];
                if (!version.match(/^v\d+$/)) continue; // Only accept v1, v2, etc.
                
                // Parse YAML to get additional version info
                let spec: any;
                try {
                    spec = parse(fileContent as string);
                } catch (parseError) {
                    console.warn(`Failed to parse YAML for ${filePath}:`, parseError);
                    continue;
                }
                
                if (spec && spec.info) {
                    versionSet.add(version);
                    
                    // Extract version info from spec if available
                    const versionInfo: ApiVersionInfo = {
                        version,
                        label: version,
                        description: spec.info.description,
                        specExists: true
                    };
                    
                    // Check if this version has specific badges/labels in the spec
                    if (spec.info['x-version-status']) {
                        versionInfo.badge = spec.info['x-version-status'];
                    } else if (spec.info.version) {
                        // Use semantic version info if available
                        const semVer = spec.info.version;
                        if (semVer.includes('beta')) {
                            versionInfo.badge = 'Beta';
                        } else if (semVer.includes('alpha')) {
                            versionInfo.badge = 'Alpha';
                        }
                    }
                    
                    versions.push(versionInfo);
                }
                
            } catch (error) {
                console.error(`Error processing versioned spec ${filePath}:`, error);
            }
        }
        
        // Sort versions by number (descending - latest first)
        const sortedVersions = Array.from(versionSet)
            .sort((a, b) => {
                const aNum = parseInt(a.substring(1));
                const bNum = parseInt(b.substring(1));
                return bNum - aNum;
            })
            .map((version, index) => {
                const existingVersion = versions.find(v => v.version === version);
                return {
                    version,
                    label: index === 0 ? `${version} (Latest)` : version,
                    badge: existingVersion?.badge || (index === 0 ? 'Latest' : (index === versions.length - 1 ? 'Legacy' : undefined)),
                    description: existingVersion?.description || (index === 0 
                        ? 'Current stable version with latest features'
                        : index === versions.length - 1
                            ? 'Legacy version - consider upgrading'
                            : 'Stable version'),
                    specExists: true
                };
            });
        
        // Cache the results
        versionCache.set(cacheKey, sortedVersions);
        
        console.log(`Detected ${sortedVersions.length} versions for ${serviceName}:`, sortedVersions.map(v => v.version));
        return sortedVersions;
        
    } catch (error) {
        console.error(`Error detecting API versions for ${serviceName}:`, error);
        
        // Fallback to default versions
        const fallbackVersions: ApiVersionInfo[] = [
            {
                version: 'v2',
                label: 'v2 (Latest)',
                badge: 'Latest',
                description: 'Current stable version',  
                specExists: false
            },
            {
                version: 'v1',
                label: 'v1',
                badge: 'Legacy',
                description: 'Legacy version',
                specExists: false
            }
        ];
        
        versionCache.set(`${serviceName}-${language}`, fallbackVersions);
        return fallbackVersions;
    }
}

/**
 * Generate a new API path with a different version
 * Handles both /api/service and /api/service/operation formats
 */
export function generateApiVersionPath(currentPath: string, newVersion: string): string {
    const [pathPart, queryPart] = currentPath.split('?');
    const pathParts = pathPart.split('/').filter(Boolean);
    
    if (pathParts.length >= 2 && pathParts[0] === 'api') {
        // For API paths, we need to append version to the service spec URL
        const serviceName = pathParts[1];
        const operationId = pathParts[2];
        
        let newPath = `/api/${serviceName}`;
        if (operationId) {
            newPath += `/${operationId}`;
        }
        
        // Preserve existing query parameters and add/update version
        const params = new URLSearchParams(queryPart || '');
        params.set('version', newVersion);
        
        return `${newPath}?${params.toString()}`;
    }
    
    // Fallback: return original path with version parameter
    const params = new URLSearchParams(queryPart || '');
    params.set('version', newVersion);
    return `${pathPart}?${params.toString()}`;
}

/**
 * Get the current version from API path or URL parameters
 */
export function getCurrentApiVersion(pathname: string, searchParams: URLSearchParams): string {
    // First check URL parameters
    const versionParam = searchParams.get('version');
    if (versionParam && versionParam.match(/^v\d+$/)) {
        return versionParam;
    }
    
    // Default to v2 if no version specified
    return 'v2';
}

/**
 * Check if a specific version exists for an API service
 */
export async function checkApiVersionExists(serviceName: string, version: string, language: string = 'en'): Promise<boolean> {
    try {
        const versions = await getApiVersions(serviceName, language);
        return versions.some(v => v.version === version && v.specExists);
    } catch (error) {
        console.error(`Error checking API version existence:`, error);
        return false;
    }
}

/**
 * Get all available API services with their versions
 */
export async function getAllApiServicesWithVersions(language: string = 'en'): Promise<Record<string, ApiVersionInfo[]>> {
    try {
        const services: Record<string, ApiVersionInfo[]> = {};
        
        // Scan all API spec directories to find services
        const yamlModules = import.meta.glob('/src/content/docs/*/apispecs/*/*/*.{yaml,yml}', {
            query: '?raw',
            import: 'default',
            eager: true
        });
        
        const serviceSet = new Set<string>();
        
        // Extract unique service names
        Object.keys(yamlModules).forEach(path => {
            if (path.includes(`/docs/${language}/apispecs/`)) {
                const match = path.match(/\/apispecs\/([^\/]+)\//);
                if (match) {
                    serviceSet.add(match[1]);
                }
            }
        });
        
        // Get versions for each service
        for (const serviceName of serviceSet) {
            services[serviceName] = await getApiVersions(serviceName, language);
        }
        
        return services;
        
    } catch (error) {
        console.error('Error getting all API services with versions:', error);
        return {};
    }
}

/**
 * Clear the API version cache (useful for development)
 */
export function clearApiVersionCache(): void {
    versionCache.clear();
}