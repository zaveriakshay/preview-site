// src/pages/apispecs/[spec].yaml.ts
// Endpoint to serve OpenAPI specs as YAML for RapiDoc
import { loadSimpleApiSpec, loadAllSimpleApiSpecs } from '../../utils/simple-openapi-loader.ts';
import { stringify } from 'yaml';

export async function getStaticPaths() {
    console.log('[YAML Endpoint] Generating static paths...');
    
    const specs = await loadAllSimpleApiSpecs();
    const paths = specs.map(spec => ({
        params: { spec: spec.id }
    }));
    
    console.log(`[YAML Endpoint] Generated ${paths.length} paths`);
    return paths;
}

export async function GET({ params, request }) {
    const { spec: specId } = params;
    
    if (!specId) {
        return new Response('Spec ID is required', {
            status: 400,
            headers: {
                'Content-Type': 'text/plain',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }

    try {
        // Get language and version from URL parameters
        const url = new URL(request.url);
        const language = url.searchParams.get('lang') || 'en';
        const version = url.searchParams.get('version') || 'v3';

        console.log(`[YAML Endpoint] Serving: ${specId}, language: ${language}, version: ${version}`);
        
        // Load the spec using the simple loader
        const apiSpec = await loadSimpleApiSpec(specId, language, version);
        
        if (!apiSpec) {
            console.error(`[YAML Endpoint] Spec not found: ${specId} (${language}/${version})`);
            return new Response(`API spec '${specId}' not found for language '${language}', version '${version}'`, {
                status: 404,
                headers: {
                    'Content-Type': 'text/plain',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }

        console.log(`[YAML Endpoint] Found spec: ${apiSpec.title} with ${apiSpec.operations.length} operations`);

        // Return the spec as YAML
        const yamlContent = stringify(apiSpec.spec);
        
        return new Response(yamlContent, {
            status: 200,
            headers: {
                'Content-Type': 'application/x-yaml',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Cache-Control': 'public, max-age=300',
            },
        });
        
    } catch (error) {
        console.error(`[YAML Endpoint] Error serving spec ${specId}:`, error);
        
        return new Response(`Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`, {
            status: 500,
            headers: {
                'Content-Type': 'text/plain',
                'Access-Control-Allow-Origin': '*',
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