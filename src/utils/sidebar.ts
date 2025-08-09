import { getCollection } from 'astro:content';
import { parseCurrentPath } from './versions.ts';

export interface SidebarItem {
    text: string;
    link: string;
    badge?: string;
    items?: SidebarItem[];
    collapsed?: boolean;
    position?: number;
}

export interface SidebarGroup {
    label: string;
    items: SidebarItem[];
    collapsed?: boolean;
}

/**
 * Generate a version-specific sidebar based on the current path context
 */
export async function generateVersionAwareSidebar(currentPath: string): Promise<SidebarGroup[]> {
    try {
        const pathInfo = parseCurrentPath(currentPath);
        const { language, guideType, version } = pathInfo;

        if (!guideType || !version) {
            return [];
        }

        const docs = await getCollection('docs');
        
        // Filter docs for the current context (language, guideType, version)
        const contextDocs = docs.filter(doc => {
            const docParts = doc.id.split('/');
            return (
                docParts[0] === language &&
                docParts[1] === 'guides' &&
                docParts[2] === guideType &&
                docParts[3] === version
            );
        });

        // Group documents by their folder structure
        const groups = new Map<string, SidebarItem[]>();

        contextDocs.forEach(doc => {
            const pathParts = doc.id.split('/');
            // Remove language/guides/guideType/version prefix to get the actual content path
            const contentPath = pathParts.slice(4);
            
            if (contentPath.length === 0) return;

            const groupName = contentPath[0];
            const fileName = contentPath[contentPath.length - 1];
            
            // Skip if it's an index file at the group level
            if (fileName === 'index.mdx' && contentPath.length === 1) return;

            if (!groups.has(groupName)) {
                groups.set(groupName, []);
            }

            const group = groups.get(groupName)!;
            
            // Create the full link path - remove trailing file extension for cleaner URLs
            let linkPath = pathParts.join('/');
            if (linkPath.endsWith('.md') || linkPath.endsWith('.mdx')) {
                linkPath = linkPath.replace(/\.(md|mdx)$/, '');
            }
            const fullLink = `/${linkPath}`;
            
            // Determine display text from frontmatter title or filename
            let displayText = doc.data.title;
            if (!displayText) {
                // Convert filename to readable text
                const cleanFileName = fileName.replace(/\.(md|mdx)$/, '');
                displayText = cleanFileName
                    .split('-')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
            }
            
            // Handle nested items (files in subdirectories)
            if (contentPath.length > 1) {
                const subFolder = contentPath.slice(1, -1).join('/');
                if (subFolder) {
                    displayText = `${formatGroupLabel(subFolder)} • ${displayText}`;
                }
            }

            // Check if this is an index file
            const isIndex = fileName === 'index.mdx' || fileName === 'index.md';
            
            // Get sidebar position from frontmatter for sorting
            const sidebarPosition = doc.data.sidebar_position || 999;
            
            group.push({
                text: displayText,
                link: fullLink,
                badge: isIndex ? undefined : undefined,
                position: sidebarPosition
            });
        });

        // Convert groups to sidebar format
        const sidebarGroups: SidebarGroup[] = [];

        // Sort groups and items
        const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
            // Custom sorting order for common groups
            const order = ['registration', 'profile', 'cards-bank-account', 'fundings', 'send-money', 'receive-money', 'user-management', 'history'];
            const aIndex = order.indexOf(a);
            const bIndex = order.indexOf(b);
            
            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return a.localeCompare(b);
        });

        sortedGroups.forEach(([groupName, items]) => {
            // Sort items within each group by position first, then by text
            const sortedItems = items.sort((a, b) => {
                const positionA = a.position || 999;
                const positionB = b.position || 999;
                
                if (positionA !== positionB) {
                    return positionA - positionB;
                }
                
                return a.text.localeCompare(b.text);
            });

            sidebarGroups.push({
                label: formatGroupLabel(groupName),
                items: sortedItems,
                collapsed: false
            });
        });

        return sidebarGroups;

    } catch (error) {
        console.error('Error generating version-aware sidebar:', error);
        return [];
    }
}

/**
 * Format group labels for better display
 */
function formatGroupLabel(groupName: string): string {
    const labelMap: Record<string, string> = {
        'cards-bank-account': 'Cards & Bank Account',
        'fundings': 'Funding',
        'send-money': 'Send Money',
        'receive-money': 'Receive Money',
        'user-management': 'User Management',
        'history': 'Transaction History',
        'registration': 'Registration',
        'profile': 'Profile Management'
    };

    return labelMap[groupName] || groupName.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

/**
 * Generate breadcrumb navigation for the current page
 */
export function generateBreadcrumbs(currentPath: string): Array<{text: string, link?: string}> {
    const pathInfo = parseCurrentPath(currentPath);
    const pathParts = currentPath.split('/').filter(Boolean);
    
    const breadcrumbs = [
        { text: 'Home', link: '/' },
        { text: pathInfo.language.toUpperCase(), link: `/${pathInfo.language}/` }
    ];

    if (pathInfo.guideType) {
        breadcrumbs.push({
            text: pathInfo.guideType.charAt(0).toUpperCase() + pathInfo.guideType.slice(1),
            link: `/${pathInfo.language}/guides/${pathInfo.guideType}/`
        });

        if (pathInfo.version) {
            breadcrumbs.push({
                text: pathInfo.version.toUpperCase(),
                link: `/${pathInfo.language}/guides/${pathInfo.guideType}/${pathInfo.version}/`
            });

            // Add remaining path segments
            const remainingParts = pathParts.slice(4);
            remainingParts.forEach((part, index) => {
                const isLast = index === remainingParts.length - 1;
                const linkParts = pathParts.slice(0, 4 + index + 1);
                
                breadcrumbs.push({
                    text: formatGroupLabel(part),
                    link: isLast ? undefined : `/${linkParts.join('/')}/`
                });
            });
        }
    }

    return breadcrumbs;
}