import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getChangelogEntries } from '../../utils/changelog.ts';

export const prerender = false;

interface SearchResult {
    title: string;
    path: string;
    type: 'guide' | 'api' | 'changelog' | 'documentation';
    excerpt: string;
    version?: string;
    language: string;
    availableVersions?: string[];
    availableLanguages?: string[];
}

export const GET: APIRoute = async ({ url }) => {
    try {
        const searchParams = url.searchParams;
        const query = searchParams.get('q')?.trim();
        const requestedLanguage = searchParams.get('lang') || 'en';

        if (!query || query.length < 2) {
            return new Response(JSON.stringify([]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const allResults: SearchResult[] = [];
        const resultsByKey = new Map<string, SearchResult & { matches: Set<string> }>();
        const queryLower = query.toLowerCase();

        try {
            // Search in documentation content across all languages
            const docs = await getCollection('docs');
            
            docs.forEach(doc => {
                const pathParts = doc.id.split('/');
                const docLanguage = pathParts[0];
                
                const title = doc.data.title || '';
                const content = doc.body || '';
                const description = doc.data.description || '';
                
                // Check if query matches title, content, or description
                const titleMatch = title.toLowerCase().includes(queryLower);
                const contentMatch = content.toLowerCase().includes(queryLower);
                const descriptionMatch = description.toLowerCase().includes(queryLower);
                
                if (titleMatch || contentMatch || descriptionMatch) {
                    let type: SearchResult['type'] = 'documentation';
                    let path = `/${doc.id}`;
                    let version: string | undefined;
                    let resultKey = '';
                    
                    // Determine type and extract version if applicable
                    if (pathParts[1] === 'guides') {
                        type = 'guide';
                        version = pathParts[3];
                        path = `/${docLanguage}/guides/${pathParts[2]}/${version}/${pathParts.slice(4).join('/')}`;
                        resultKey = `guide:${pathParts[2]}:${pathParts.slice(4).join('/')}`;
                    } else if (pathParts[1] === 'apispecs') {
                        type = 'api';
                        const apiName = pathParts[2];
                        version = pathParts[3];
                        path = `/api/${apiName}${version ? `?version=${version}` : ''}`;
                        resultKey = `api:${apiName}`;
                    } else if (pathParts[1] === 'changelogs') {
                        type = 'changelog';
                        path = `/${docLanguage}/changelogs/${pathParts.slice(2).join('/')}`.replace('.md', '');
                        resultKey = `changelog:${pathParts.slice(2).join('/')}`; 
                    }
                    
                    // Create excerpt
                    let excerpt = '';
                    if (titleMatch) {
                        excerpt = title;
                    } else if (descriptionMatch) {
                        excerpt = description;
                    } else {
                        // Extract context around the match
                        const matchIndex = content.toLowerCase().indexOf(queryLower);
                        const start = Math.max(0, matchIndex - 50);
                        const end = Math.min(content.length, matchIndex + query.length + 50);
                        excerpt = content.substring(start, end).trim();
                        if (start > 0) excerpt = '...' + excerpt;
                        if (end < content.length) excerpt = excerpt + '...';
                    }
                    
                    // Clean up excerpt
                    excerpt = excerpt
                        .replace(/#{1,6}\s+/g, '') // Remove markdown headers
                        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
                        .replace(/\*(.*?)\*/g, '$1') // Remove italic
                        .replace(/`(.*?)`/g, '$1') // Remove inline code
                        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
                        .replace(/\n+/g, ' ') // Replace newlines with spaces
                        .trim();
                    
                    if (excerpt.length > 150) {
                        excerpt = excerpt.substring(0, 147) + '...';
                    }
                    
                    if (resultKey && resultsByKey.has(resultKey)) {
                        // Add version/language to existing result
                        const existing = resultsByKey.get(resultKey)!;
                        if (version && !existing.availableVersions?.includes(version)) {
                            existing.availableVersions = existing.availableVersions || [];
                            existing.availableVersions.push(version);
                        }
                        if (!existing.availableLanguages?.includes(docLanguage)) {
                            existing.availableLanguages = existing.availableLanguages || [];
                            existing.availableLanguages.push(docLanguage);
                        }
                        existing.matches.add(`${docLanguage}:${version || 'default'}`);
                    } else {
                        // Create new result
                        const result: SearchResult & { matches: Set<string> } = {
                            title: title || 'Untitled',
                            path: docLanguage === requestedLanguage ? path : path.replace(`/${docLanguage}/`, `/${requestedLanguage}/`),
                            type,
                            excerpt: excerpt || 'No description available',
                            version: docLanguage === requestedLanguage ? version : undefined,
                            language: requestedLanguage,
                            availableVersions: version ? [version] : [],
                            availableLanguages: [docLanguage],
                            matches: new Set([`${docLanguage}:${version || 'default'}`])
                        };
                        if (resultKey) {
                            resultsByKey.set(resultKey, result);
                        } else {
                            allResults.push(result);
                        }
                    }
                }
            });
            // Convert Map results to array
            resultsByKey.forEach(result => {
                const { matches, ...searchResult } = result;
                allResults.push(searchResult);
            });
        } catch (docsError) {
            console.error('Error searching docs:', docsError);
        }

        try {
            // Search in changelog entries for requested language
            const changelogEntries = await getChangelogEntries(requestedLanguage);
            
            if (changelogEntries && Array.isArray(changelogEntries)) {
                changelogEntries.forEach(entry => {
                const titleMatch = entry.title.toLowerCase().includes(queryLower);
                const contentMatch = entry.content.toLowerCase().includes(queryLower);
                const tagsMatch = entry.tags.some(tag => tag.toLowerCase().includes(queryLower));
                
                if (titleMatch || contentMatch || tagsMatch) {
                    let excerpt = '';
                    if (titleMatch) {
                        excerpt = entry.title;
                    } else if (entry.excerpt) {
                        excerpt = entry.excerpt;
                    } else {
                        // Extract context from content
                        const matchIndex = entry.content.toLowerCase().indexOf(queryLower);
                        if (matchIndex >= 0) {
                            const start = Math.max(0, matchIndex - 50);
                            const end = Math.min(entry.content.length, matchIndex + query.length + 50);
                            excerpt = entry.content.substring(start, end).trim();
                            if (start > 0) excerpt = '...' + excerpt;
                            if (end < entry.content.length) excerpt = excerpt + '...';
                        }
                    }
                    
                    // Clean excerpt
                    excerpt = excerpt
                        .replace(/#{1,6}\s+/g, '')
                        .replace(/\*\*(.*?)\*\*/g, '$1')
                        .replace(/\*(.*?)\*/g, '$1')
                        .replace(/`(.*?)`/g, '$1')
                        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                        .replace(/\n+/g, ' ')
                        .trim();
                    
                    if (excerpt.length > 150) {
                        excerpt = excerpt.substring(0, 147) + '...';
                    }
                    
                    allResults.push({
                        title: entry.title,
                        path: `/${requestedLanguage}/changelogs/${entry.slug}`,
                        type: 'changelog',
                        excerpt: excerpt || 'No description available',
                        version: entry.version,
                        language: requestedLanguage
                    });
                }
                });
            }
        } catch (changelogError) {
            console.error('Error searching changelogs:', changelogError);
        }

        // Sort results by relevance (title matches first, then by type)
        allResults.sort((a, b) => {
            const aTitle = a.title.toLowerCase().includes(queryLower);
            const bTitle = b.title.toLowerCase().includes(queryLower);
            
            if (aTitle && !bTitle) return -1;
            if (!aTitle && bTitle) return 1;
            
            // Sort by type priority: guides > api > changelog > documentation
            const typePriority = { guide: 1, api: 2, changelog: 3, documentation: 4 };
            const aPriority = typePriority[a.type] || 5;
            const bPriority = typePriority[b.type] || 5;
            
            if (aPriority !== bPriority) {
                return aPriority - bPriority;
            }
            
            return a.title.localeCompare(b.title);
        });

        // Limit results to 30 items to show more options
        const limitedResults = allResults.slice(0, 30);

        return new Response(JSON.stringify(limitedResults), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });

    } catch (error) {
        console.error('Search API error:', error);
        
        return new Response(JSON.stringify({
            error: 'Search failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};