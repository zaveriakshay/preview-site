import { parse } from 'yaml';
import type { OpenAPIV3 } from 'openapi-types';

export interface ApiSpec {
    id: string;
    title: string;
    description: string;
    version: string;
    language: string;
    folderVersion: string; // v1, v2, v3 from folder structure
    spec: OpenAPIV3.Document;
    operations: ApiOperation[];
    filePath: string;
}

export interface ApiOperation {
    operationId: string;
    method: string;
    path: string;
    summary: string;
    description?: string;
    tags: string[];
}

// Simple file system based loader for server-side use
export async function loadApiSpec(
    serviceName: string, 
    language: string = 'en', 
    version: string = 'v3'
): Promise<ApiSpec | null> {
    try {
        console.log(`[OpenAPI Loader] Loading spec: ${serviceName}, lang: ${language}, version: ${version}`);
        
        // Build the file path based on folder structure
        const possiblePaths = [
            `/src/content/docs/${language}/apispecs/${serviceName}/${version}/${serviceName}-${version}-openapi.yaml`,
            `/src/content/docs/${language}/apispecs/${serviceName}/${version}/${serviceName}-openapi.yaml`,
            `/src/content/docs/${language}/apispecs/${serviceName}/${version}/openapi.yaml`,
            // Support the existing misnamed files
            `/src/content/docs/${language}/apispecs/${serviceName}/${version}/${serviceName}-v3-openapi.yaml`,
            `/src/content/docs/${language}/apispecs/${serviceName}/${version}/${serviceName}-v2-openapi.yaml`,
            `/src/content/docs/${language}/apispecs/${serviceName}/${version}/payment-v3-openapi.yaml`,
            `/src/content/docs/${language}/apispecs/${serviceName}/${version}/payment-v2-openapi.yaml`,
        ];

        // Try to load the spec from possible paths
        for (const path of possiblePaths) {
            try {
                console.log(`[OpenAPI Loader] Trying path: ${path}`);
                
                // Use import.meta.glob with eager loading
                const modules = import.meta.glob('/src/content/docs/*/apispecs/*/*/*.yaml', {
                    query: '?raw',
                    import: 'default',
                    eager: true
                });

                if (modules[path]) {
                    const content = modules[path] as string;
                    const spec = parse(content) as OpenAPIV3.Document;
                    
                    if (!spec || !spec.info) {
                        console.warn(`[OpenAPI Loader] Invalid spec at ${path}`);
                        continue;
                    }

                    // Extract operations
                    const operations: ApiOperation[] = [];
                    if (spec.paths) {
                        Object.entries(spec.paths).forEach(([path, pathItem]) => {
                            if (!pathItem || typeof pathItem === 'string') return;
                            
                            const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
                            methods.forEach(method => {
                                const operation = pathItem[method];
                                if (operation && 'operationId' in operation) {
                                    operations.push({
                                        operationId: operation.operationId || `${method}-${path}`,
                                        method: method.toUpperCase(),
                                        path,
                                        summary: operation.summary || '',
                                        description: operation.description,
                                        tags: operation.tags || []
                                    });
                                }
                            });
                        });
                    }

                    console.log(`[OpenAPI Loader] Successfully loaded ${serviceName} (${language}/${version}) with ${operations.length} operations`);

                    return {
                        id: serviceName,
                        title: spec.info.title,
                        description: spec.info.description || '',
                        version: spec.info.version,
                        language,
                        folderVersion: version,
                        spec,
                        operations,
                        filePath: path
                    };
                }
            } catch (error) {
                console.error(`[OpenAPI Loader] Error trying path ${path}:`, error);
            }
        }

        console.error(`[OpenAPI Loader] No spec found for ${serviceName} (${language}/${version})`);
        return null;
    } catch (error) {
        console.error(`[OpenAPI Loader] Error loading spec:`, error);
        return null;
    }
}

// Load all available API specs for static generation
export async function loadAllApiSpecs(): Promise<ApiSpec[]> {
    console.log('[OpenAPI Loader] Loading all API specs...');
    
    const specs: ApiSpec[] = [];
    const languages = ['en', 'ar'];
    const versions = ['v1', 'v2', 'v3'];
    const services = ['payment-api', 'wallet-api']; // Add more as needed

    for (const language of languages) {
        for (const version of versions) {
            for (const service of services) {
                const spec = await loadApiSpec(service, language, version);
                if (spec) {
                    specs.push(spec);
                }
            }
        }
    }

    console.log(`[OpenAPI Loader] Loaded ${specs.length} total specs`);
    return specs;
}

// Get available versions for a specific service
export async function getAvailableVersions(serviceName: string, language: string = 'en'): Promise<string[]> {
    const versions: string[] = [];
    const possibleVersions = ['v1', 'v2', 'v3'];

    for (const version of possibleVersions) {
        const spec = await loadApiSpec(serviceName, language, version);
        if (spec) {
            versions.push(version);
        }
    }

    return versions;
}

// Serve raw YAML content for RapiDoc
export async function getYamlContent(
    serviceName: string,
    language: string = 'en',
    version: string = 'v3'
): Promise<string | null> {
    try {
        console.log(`[OpenAPI Loader] Getting YAML content: ${serviceName}, lang: ${language}, version: ${version}`);
        
        const spec = await loadApiSpec(serviceName, language, version);
        if (!spec) {
            return null;
        }

        // Return the raw spec as YAML
        const yaml = require('yaml');
        return yaml.stringify(spec.spec);
    } catch (error) {
        console.error(`[OpenAPI Loader] Error getting YAML content:`, error);
        return null;
    }
}