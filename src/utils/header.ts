import { getCollection } from 'astro:content';
import { parseCurrentPath } from './versions.ts';

export interface GuideTab {
    id: string;
    label: string;
    path: string;
    isActive: boolean;
}

export interface ApiSpec {
    id: string;
    title: string;
    path: string;
    serviceName: string;
}

export interface LanguageOption {
    code: string;
    label: string;
    flag: string;
    isActive: boolean;
}

/**
 * Get available guide types (mobile, web, etc.) for the current language and version
 */
export async function getGuideTypes(language: string = 'en', version: string = 'v2'): Promise<GuideTab[]> {
    try {
        const docs = await getCollection('docs');
        const guideTypes = new Set<string>();

        // For changelog pages or when version is 'latest', use the most recent version
        let actualVersion = version;
        if (version === 'latest') {
            // Find the most recent version by checking available versions
            const versions = new Set<string>();
            docs.forEach(doc => {
                const pathParts = doc.id.split('/');
                if (pathParts[0] === language && pathParts[1] === 'guides' && pathParts[3]) {
                    versions.add(pathParts[3]);
                }
            });
            
            // Sort versions and get the latest (assuming semantic versioning)
            const sortedVersions = Array.from(versions).sort((a, b) => {
                const aNum = a.replace('v', '').split('.').map(Number);
                const bNum = b.replace('v', '').split('.').map(Number);
                for (let i = 0; i < Math.max(aNum.length, bNum.length); i++) {
                    const aPart = aNum[i] || 0;
                    const bPart = bNum[i] || 0;
                    if (aPart !== bPart) return bPart - aPart;
                }
                return 0;
            });
            
            actualVersion = sortedVersions[0] || 'v2';
        }

        // Find all guide types for the current language and version
        docs.forEach(doc => {
            const pathParts = doc.id.split('/');
            if (pathParts[0] === language && 
                pathParts[1] === 'guides' && 
                pathParts[3] === actualVersion) {
                const guideType = pathParts[2];
                if (guideType) {
                    guideTypes.add(guideType);
                }
            }
        });

        const guideTabs = Array.from(guideTypes)
            .sort()
            .map(guideType => ({
                id: guideType,
                label: formatGuideTypeLabel(guideType),
                path: `/${language}/guides/${guideType}/${actualVersion}/`,
                isActive: false // Will be set by the component based on current path
            }));

        // Add changelog tab
        guideTabs.push({
            id: 'changelogs',
            label: language === 'ar' ? 'سجل التغييرات' : 'Change Logs',
            path: `/${language}/changelogs`,
            isActive: false
        });

        return guideTabs;

    } catch (error) {
        console.error('Error getting guide types:', error);
        return [];
    }
}

/**
 * Get available API specs for the current language
 */
export async function getApiSpecs(language: string = 'en'): Promise<ApiSpec[]> {
    try {
        // Import the dynamic OpenAPI utilities
        const { getApiSpecsForHeader } = await import('./dynamic-openapi.ts');
        const specs = await getApiSpecsForHeader(language);
        
        return specs.map(spec => ({
            id: spec.id,
            title: spec.title,
            path: spec.path,
            serviceName: spec.serviceName
        }));

    } catch (error) {
        console.error('Error getting API specs:', error);
        // Return fallback specs if dynamic loading fails
        return [
            {
                id: 'payment-api',
                title: 'Payment API',
                path: `/api/payment-service`,
                serviceName: 'Payment Service'
            },
            {
                id: 'merchant-api',
                title: 'Merchant API',
                path: `/api/merchant-service`,
                serviceName: 'Merchant Service'
            }
        ];
    }
}

/**
 * Get available languages
 */
export function getLanguageOptions(currentLanguage: string = 'en'): LanguageOption[] {
    const languages = [
        { code: 'en', label: 'English', flag: '🇺🇸' },
        { code: 'ar', label: 'العربية', flag: '🇦🇪' }
    ];

    return languages.map(lang => ({
        ...lang,
        isActive: lang.code === currentLanguage
    }));
}

/**
 * Generate header context from current path
 */
export function getHeaderContext(currentPath: string, searchParams?: URLSearchParams) {
    const isApiPage = currentPath.includes('/api/');
    const isGuidePage = currentPath.includes('/guides/');
    const isChangelogPage = currentPath.includes('/changelogs');
    
    if (isApiPage) {
        // For API pages: /api/serviceName/operationId
        const pathParts = currentPath.split('/').filter(Boolean);
        
        // Get language and version from URL parameters if available
        const langParam = searchParams?.get('lang');
        const versionParam = searchParams?.get('version');
        
        return {
            language: langParam || 'en', // Default to en for API pages
            guideType: null,
            version: versionParam || 'v2', // Default version
            isApiPage: true,
            isGuidePage: false,
            isChangelogPage: false,
            currentPath
        };
    } else if (isChangelogPage) {
        // For changelog pages: /en/changelogs or /ar/changelogs
        const pathParts = currentPath.split('/').filter(Boolean);
        const language = pathParts[0] || 'en';
        
        return {
            language,
            guideType: 'changelogs',
            version: 'latest', // Changelogs don't use versioning
            isApiPage: false,
            isGuidePage: false,
            isChangelogPage: true,
            currentPath
        };
    } else {
        const pathInfo = parseCurrentPath(currentPath);
        return {
            language: pathInfo.language,
            guideType: pathInfo.guideType,
            version: pathInfo.version,
            isApiPage: false,
            isGuidePage,
            isChangelogPage: false,
            currentPath
        };
    }
}

/**
 * Format guide type labels for display
 */
function formatGuideTypeLabel(guideType: string): string {
    const labelMap: Record<string, string> = {
        'mobile': 'Mobile',
        'web': 'Web',
        'desktop': 'Desktop',
        'api': 'API',
        'webhook': 'Webhooks'
    };

    return labelMap[guideType] || guideType.charAt(0).toUpperCase() + guideType.slice(1);
}

/**
 * Format service name for API specs
 */
function formatServiceName(serviceName: string): string {
    return serviceName
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Generate navigation URL for language switching
 */
export function generateLanguageUrl(currentPath: string, targetLanguage: string): string {
    const pathParts = currentPath.split('/').filter(Boolean);
    
    // Handle API pages specially - they don't have language prefix
    if (pathParts.length > 0 && pathParts[0] === 'api') {
        // For API pages, add language parameter to the same URL
        return `${currentPath}?lang=${targetLanguage}`;
    }
    
    // For regular pages, replace or add language prefix
    if (pathParts.length > 0) {
        // Check if first part is a language code (en/ar)
        if (pathParts[0] === 'en' || pathParts[0] === 'ar') {
            // Replace the language
            pathParts[0] = targetLanguage;
        } else {
            // Add language prefix
            pathParts.unshift(targetLanguage);
        }
        return '/' + pathParts.join('/');
    }
    
    return `/${targetLanguage}`;
}

/**
 * Search functionality placeholder
 */
export interface SearchResult {
    title: string;
    path: string;
    type: 'guide' | 'api';
    excerpt: string;
}

export async function searchDocuments(query: string, language: string = 'en'): Promise<SearchResult[]> {
    if (!query || query.length < 2) return [];
    
    try {
        const docs = await getCollection('docs');
        const results: SearchResult[] = [];
        
        docs.forEach(doc => {
            const pathParts = doc.id.split('/');
            if (pathParts[0] !== language) return;
            
            const title = doc.data.title || '';
            const content = doc.body || '';
            
            // Simple search - in a real implementation, you'd want more sophisticated search
            if (title.toLowerCase().includes(query.toLowerCase()) || 
                content.toLowerCase().includes(query.toLowerCase())) {
                
                results.push({
                    title: title || 'Untitled',
                    path: `/${doc.id}`,
                    type: pathParts[1] === 'apispecs' ? 'api' : 'guide',
                    excerpt: content.substring(0, 150) + '...'
                });
            }
        });
        
        return results.slice(0, 10); // Limit to 10 results
        
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}