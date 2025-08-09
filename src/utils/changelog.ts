import { getCollection } from 'astro:content';

export interface ChangelogEntry {
    id: string;
    title: string;
    date: string;
    version?: string;
    type: 'platform' | 'api' | 'sdk' | 'documentation';
    category: 'release' | 'major-release' | 'update' | 'hotfix';
    author: string;
    tags: string[];
    slug: string;
    excerpt?: string;
    content: string;
    versionHistory?: string;
    updatedBy?: string;
    approvedBy?: string;
    relatedFiles?: string[];
}

export interface DocumentInfo {
    title?: string;
    currentVersion?: string;
    author?: string;
    versionHistory?: string;
    updatedBy?: string;
    approvedBy?: string;
    relatedFiles?: string[];
}

export interface ChangelogFilter {
    type?: string;
    category?: string;
    dateFrom?: string;
    dateTo?: string;
    tags?: string[];
    version?: string;
}

/**
 * Get all changelog entries for a specific language
 */
export async function getChangelogEntries(language: string = 'en'): Promise<ChangelogEntry[]> {
    try {
        const docs = await getCollection('docs');
        const changelogEntries: ChangelogEntry[] = [];

        if (!docs || docs.length === 0) {
            console.warn('No docs found in content collection');
            return [];
        }

        // Filter for changelog entries with better error handling
        const changelogDocs = docs.filter(doc => {
            try {
                if (!doc || !doc.id) return false;
                const pathParts = doc.id.split('/');
                return pathParts.length >= 2 && 
                       pathParts[0] === language && 
                       pathParts[1] === 'changelogs' && 
                       doc.id.endsWith('.md');
            } catch (error) {
                console.warn('Error filtering changelog doc:', doc?.id, error);
                return false;
            }
        });

        for (const doc of changelogDocs) {
            try {
                const pathParts = doc.id.split('/');
                const filename = pathParts[pathParts.length - 1];
                const slug = filename.replace('.md', '');

                // Skip index files
                if (slug === 'index') continue;

                // Validate required data fields
                if (!doc.data) {
                    console.warn('Changelog doc missing data:', doc.id);
                    continue;
                }

                const entry: ChangelogEntry = {
                    id: doc.id,
                    title: doc.data.title || 'Untitled Change',
                    date: doc.data.date || new Date().toISOString().split('T')[0],
                    version: doc.data.version,
                    type: doc.data.type || 'platform',
                    category: doc.data.category || 'update',
                    author: doc.data.author || 'noqodi Team',
                    tags: doc.data.tags || [],
                    slug,
                    excerpt: extractExcerpt(doc.body || ''),
                    content: doc.body || ''
                };

                changelogEntries.push(entry);
            } catch (error) {
                console.error('Error processing changelog entry:', doc?.id, error);
                // Continue processing other entries
            }
        }

        // Sort by date (newest first)
        return changelogEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    } catch (error) {
        console.error('Error loading changelog entries:', error);
        return [];
    }
}

/**
 * Get filtered changelog entries
 */
export async function getFilteredChangelogEntries(
    language: string = 'en', 
    filter: ChangelogFilter = {}
): Promise<ChangelogEntry[]> {
    const allEntries = await getChangelogEntries(language);
    
    return allEntries.filter(entry => {
        // Filter by type
        if (filter.type && entry.type !== filter.type) {
            return false;
        }

        // Filter by category
        if (filter.category && entry.category !== filter.category) {
            return false;
        }

        // Filter by version
        if (filter.version && entry.version !== filter.version) {
            return false;
        }

        // Filter by date range
        if (filter.dateFrom && new Date(entry.date) < new Date(filter.dateFrom)) {
            return false;
        }

        if (filter.dateTo && new Date(entry.date) > new Date(filter.dateTo)) {
            return false;
        }

        // Filter by tags
        if (filter.tags && filter.tags.length > 0) {
            const hasMatchingTag = filter.tags.some(tag => entry.tags.includes(tag));
            if (!hasMatchingTag) {
                return false;
            }
        }

        return true;
    });
}

/**
 * Get changelog entry by slug
 */
export async function getChangelogEntry(slug: string, language: string = 'en'): Promise<ChangelogEntry | null> {
    const entries = await getChangelogEntries(language);
    return entries.find(entry => entry.slug === slug) || null;
}

/**
 * Get changelog statistics
 */
export async function getChangelogStats(language: string = 'en'): Promise<{
    total: number;
    byType: Record<string, number>;
    byCategory: Record<string, number>;
    recentCount: number;
}> {
    const entries = await getChangelogEntries(language);
    
    const stats = {
        total: entries.length,
        byType: {} as Record<string, number>,
        byCategory: {} as Record<string, number>,
        recentCount: 0
    };

    // Count recent entries (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    entries.forEach(entry => {
        // Count by type
        stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
        
        // Count by category
        stats.byCategory[entry.category] = (stats.byCategory[entry.category] || 0) + 1;
        
        // Count recent entries
        if (new Date(entry.date) >= thirtyDaysAgo) {
            stats.recentCount++;
        }
    });

    return stats;
}

/**
 * Get unique tags across all changelog entries
 */
export async function getChangelogTags(language: string = 'en'): Promise<string[]> {
    const entries = await getChangelogEntries(language);
    const tagSet = new Set<string>();
    
    entries.forEach(entry => {
        entry.tags.forEach(tag => tagSet.add(tag));
    });
    
    return Array.from(tagSet).sort();
}

/**
 * Get unique versions from changelog entries
 */
export async function getChangelogVersions(language: string = 'en'): Promise<string[]> {
    const entries = await getChangelogEntries(language);
    const versionSet = new Set<string>();
    
    entries.forEach(entry => {
        if (entry.version) {
            versionSet.add(entry.version);
        }
    });
    
    return Array.from(versionSet).sort((a, b) => {
        // Sort versions semantically (v3.0.0 > v2.1.0 > v1.0.0)
        const aVersion = a.replace(/^v/, '').split('.').map(Number);
        const bVersion = b.replace(/^v/, '').split('.').map(Number);
        
        for (let i = 0; i < Math.max(aVersion.length, bVersion.length); i++) {
            const aPart = aVersion[i] || 0;
            const bPart = bVersion[i] || 0;
            
            if (aPart !== bPart) {
                return bPart - aPart; // Descending order
            }
        }
        
        return 0;
    });
}

/**
 * Extract document information table from markdown content
 */
export function extractDocumentInfo(content: string): DocumentInfo | null {
    try {
        if (!content || typeof content !== 'string') {
            return null;
        }
        
        // Look for the document information table section
        const tableStartRegex = /##\s*Document Information/i;
        const tableMatch = content.match(tableStartRegex);
        
        if (!tableMatch) {
            return null;
        }
        
        // Extract everything after the Document Information header until the next ## header or end
        const startIndex = tableMatch.index! + tableMatch[0].length;
        const remainingContent = content.substring(startIndex);
        const nextSectionMatch = remainingContent.match(/^##\s+/m);
        const tableContent = nextSectionMatch 
            ? remainingContent.substring(0, nextSectionMatch.index)
            : remainingContent;
        
        // Extract table rows with multiple strategies
        const info: Partial<DocumentInfo> = {};
        
        // Strategy 1: Standard markdown table with bold field names
        const tableRowRegex = /\|\s*\*\*([^*|]+)\*\*\s*\|\s*([^|]+?)\s*\|/g;
        let matches = [...tableContent.matchAll(tableRowRegex)];
        
        // Strategy 2: If no matches, try without bold formatting
        if (matches.length === 0) {
            const simpleRowRegex = /\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/g;
            const allMatches = [...tableContent.matchAll(simpleRowRegex)];
            // Skip header rows (Field | Value)
            matches = allMatches.filter(match => 
                !match[1].toLowerCase().includes('field') && 
                !match[1].toLowerCase().includes('value') &&
                !match[1].includes('---')
            );
        }
        
        if (matches.length === 0) {
            return null;
        }
        
        matches.forEach((match) => {
            const field = match[1].trim().toLowerCase().replace(/\*\*/g, '');
            let value = match[2].trim();
            
            // Clean up HTML entities and tags if present
            value = value.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
            
            switch (field) {
                case 'title':
                    info.title = value;
                    break;
                case 'current version':
                    info.currentVersion = value;
                    break;
                case 'author':
                    info.author = value;
                    break;
                case 'version history':
                    // Handle both <br/> and <br> tags, plus markdown line breaks
                    info.versionHistory = value
                        .replace(/<br\s*\/?>/gi, '\n')
                        .replace(/\\n/g, '\n');
                    break;
                case 'updated by':
                    info.updatedBy = value;
                    break;
                case 'approved by':
                    info.approvedBy = value;
                    break;
                case 'related files':
                    // Handle both <br/> tags and newlines for splitting files
                    const filesSplit = value
                        .split(/<br\s*\/?>/gi)
                        .flatMap(file => file.split('\n'))
                        .map(file => file.trim())
                        .filter(file => file.length > 0);
                    info.relatedFiles = filesSplit;
                    break;
            }
        });
        
        // Only return if we have at least some required fields
        if (info.title || info.currentVersion || info.author) {
            return info as DocumentInfo;
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Extract excerpt from markdown content
 */
function extractExcerpt(content: string, maxLength: number = 200): string {
    // Remove markdown headers and formatting
    const cleaned = content
        .replace(/^#{1,6}\s+/gm, '') // Remove headers
        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.*?)\*/g, '$1') // Remove italic
        .replace(/`(.*?)`/g, '$1') // Remove inline code
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
        .replace(/^\s*[-*+]\s+/gm, '') // Remove list markers
        .replace(/\n\s*\n/g, ' ') // Replace multiple newlines with space
        .trim();

    // Find the first meaningful paragraph
    const paragraphs = cleaned.split('\n').filter(p => p.trim().length > 20);
    const firstParagraph = paragraphs[0] || cleaned;

    if (firstParagraph.length <= maxLength) {
        return firstParagraph;
    }

    // Truncate at word boundary
    const truncated = firstParagraph.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    return lastSpace > 0 
        ? truncated.substring(0, lastSpace) + '...'
        : truncated + '...';
}

/**
 * Format date for display
 */
export function formatChangelogDate(dateString: string, language: string = 'en'): string {
    const date = new Date(dateString);
    
    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    };

    return date.toLocaleDateString(language === 'ar' ? 'ar-AE' : 'en-US', options);
}

/**
 * Get type label for display
 */
export function getTypeLabel(type: string, language: string = 'en'): string {
    const labels = {
        en: {
            platform: 'Platform',
            api: 'API',
            sdk: 'SDK',
            documentation: 'Documentation'
        },
        ar: {
            platform: 'المنصة',
            api: 'واجهة برمجة التطبيقات',
            sdk: 'مجموعة تطوير البرمجيات',
            documentation: 'الوثائق'
        }
    };

    return labels[language as keyof typeof labels]?.[type as keyof typeof labels.en] || type;
}

/**
 * Get category label for display
 */
export function getCategoryLabel(category: string, language: string = 'en'): string {
    const labels = {
        en: {
            release: 'Release',
            'major-release': 'Major Release',
            update: 'Update',
            hotfix: 'Hotfix'
        },
        ar: {
            release: 'إصدار',
            'major-release': 'إصدار رئيسي',
            update: 'تحديث',
            hotfix: 'إصلاح عاجل'
        }
    };

    return labels[language as keyof typeof labels]?.[category as keyof typeof labels.en] || category;
}

/**
 * Get changelog for a specific document path based on the pattern:
 * docs/{language}/{docType}/{moduleType}/{version}/ -> docs/{language}/changelogs/{docType}_{moduleType}_{version}.md
 */
export async function getChangelogForPath(
    language: string,
    docType: string,
    moduleType: string,
    version: string
): Promise<ChangelogEntry | null> {
    try {
        const changelogSlug = `${docType}_${moduleType}_${version}`;
        return await getChangelogEntry(changelogSlug, language);
    } catch (error) {
        console.error('Error getting changelog for path:', error);
        return null;
    }
}

/**
 * Get changelog content for use as a cover note in document exports
 */
export async function getChangelogCoverNote(
    language: string,
    docType: string,
    moduleType: string,
    version: string
): Promise<string | null> {
    try {
        const changelog = await getChangelogForPath(language, docType, moduleType, version);
        
        if (!changelog) {
            return null;
        }

        // Extract the cover note content from the changelog
        let coverNote = `# ${changelog.title}\n\n`;
        
        // Add basic metadata
        coverNote += `**Version:** ${changelog.version || version}\n`;
        coverNote += `**Date:** ${changelog.date}\n`;
        coverNote += `**Author:** ${changelog.author}\n\n`;
        
        // Add the content
        coverNote += changelog.content;
        
        return coverNote;
    } catch (error) {
        console.error('Error getting changelog cover note:', error);
        return null;
    }
}