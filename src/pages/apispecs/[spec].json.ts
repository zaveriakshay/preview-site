// src/pages/apispecs/[spec].json.ts
// Dynamic API endpoint to serve OpenAPI specs as JSON
import { loadAllApiSpecs, getApiSpecById } from '../../utils/dynamic-openapi.ts';

export async function getStaticPaths() {
    const paths: Array<{ params: { spec: string } }> = [];
    
    // Generate paths for both languages
    const languages = ['en', 'ar'];
    
    const versions = ['v1', 'v2', 'v3']; // Support multiple versions
    
    for (const language of languages) {
        for (const version of versions) {
            try {
                const specs = await loadAllApiSpecs(language, version);
                
                for (const spec of specs) {
                    paths.push({ 
                        params: { 
                            spec: spec.id 
                        }
                    });
                }
            } catch (error) {
                console.error(`Error loading specs for language ${language}, version ${version}:`, error);
            }
        }
    }
    
    console.log(`Generated ${paths.length} JSON API spec paths`);
    return paths;
}

export async function GET({ params, request }) {
    const { spec } = params;
    
    if (!spec) {
        return new Response(JSON.stringify({ error: 'Spec ID is required' }), {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }

    try {
        // Try to get the language and version from the request headers or use defaults
        const url = new URL(request.url);
        const language = url.searchParams.get('lang') || 'en';
        const version = url.searchParams.get('version') || 'v3';
        
        // Get the API spec for the specified version
        const apiSpec = await getApiSpecById(spec, language, version);
        
        if (!apiSpec) {
            return new Response(JSON.stringify({ 
                error: `API spec '${spec}' not found for language '${language}'` 
            }), {
                status: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            });
        }

        // Return the OpenAPI spec as JSON
        return new Response(JSON.stringify(apiSpec.spec, null, 2), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
            },
        });
        
    } catch (error) {
        console.error(`Error serving API spec ${spec}:`, error);
        
        return new Response(JSON.stringify({ 
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS() {
    return new Response(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}