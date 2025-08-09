import { parse } from 'yaml';

export interface DynamicApiSpec {
    id: string;
    fileName: string;
    title: string;
    description?: string;
    version: string;
    serviceName: string;
    operations: DynamicApiOperation[];
    spec: any; // Full OpenAPI spec
    language: string;
}

export interface DynamicApiOperation {
    operationId: string;
    method: string;
    path: string;
    summary: string;
    description?: string;
    tags: string[];
    markdownContent?: string; // Embedded markdown for this operation
}

export interface ApiSpecCache {
    specs: DynamicApiSpec[];
    lastUpdated: number;
}

// In-memory cache for loaded specs
let apiSpecCache: ApiSpecCache | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Load all API specs using Vite's import.meta.glob
 * Now supports versioned specs from folder structure
 */
export async function loadAllApiSpecs(language: string = 'en', version: string = 'v3'): Promise<DynamicApiSpec[]> {
    try {
        // Check cache first - include version in cache key
        const cacheKey = `${language}-${version}`;
        if (apiSpecCache && 
            Date.now() - apiSpecCache.lastUpdated < CACHE_DURATION) {
            return apiSpecCache.specs.filter(spec => 
                spec.language === language && spec.version.startsWith(version)
            );
        }

        console.log(`Loading API specs for language: ${language}, version: ${version}`);
        
        const specs: DynamicApiSpec[] = [];
        
        try {
            // Import all versioned YAML files as text
            const yamlModules = import.meta.glob('/src/content/docs/*/apispecs/*/*/*.{yaml,yml}', {
                query: '?raw',
                import: 'default',
                eager: true
            });
            
            console.log(`Found ${Object.keys(yamlModules).length} total versioned YAML files:`);
            Object.keys(yamlModules).forEach(path => console.log(`  - ${path}`));
            
            // Filter for the specific language and version
            const languageVersionFiles = Object.entries(yamlModules).filter(([path]) => 
                path.includes(`/docs/${language}/apispecs/`) && path.includes(`/${version}/`)
            );
            
            console.log(`Found ${languageVersionFiles.length} files for language ${language}, version ${version}:`);
            languageVersionFiles.forEach(([path]) => console.log(`  - ${path}`));
            
            for (const [filePath, fileContent] of languageVersionFiles) {
                try {
                    console.log(`Processing versioned spec: ${filePath}`);
                    
                    // Extract service name and filename from path
                    // Path format: /src/content/docs/en/apispecs/payment-api/v2/payment-openapi.yaml
                    const pathMatch = filePath.match(/\/apispecs\/([^\/]+)\/([^\/]+)\/([^\/]+)$/);
                    if (!pathMatch) {
                        console.warn(`Could not parse path format: ${filePath}`);
                        continue;
                    }
                    
                    const [, serviceName, versionDir, fileName] = pathMatch;
                    const specId = serviceName; // Use service name as ID
                    
                    // Parse YAML content
                    let spec: any;
                    try {
                        spec = parse(fileContent as string);
                    } catch (parseError) {
                        console.error(`Failed to parse YAML for ${fileName}:`, parseError);
                        continue;
                    }
                    
                    if (!spec || !spec.info) {
                        console.warn(`Invalid OpenAPI spec in ${fileName}: missing info section`);
                        continue;
                    }
                    
                    // Extract operations
                    const operations = extractOperationsFromSpec(spec, specId);
                    
                    const dynamicSpec: DynamicApiSpec = {
                        id: specId,
                        fileName,
                        title: spec.info.title || formatServiceName(specId),
                        description: spec.info.description,
                        version: spec.info.version || versionDir,  
                        serviceName: formatServiceName(specId),
                        operations,
                        spec,
                        language
                    };
                    
                    specs.push(dynamicSpec);
                    console.log(`Loaded versioned spec: ${dynamicSpec.title} (${versionDir}) with ${operations.length} operations`);
                    
                } catch (error) {
                    console.error(`Error processing versioned spec ${filePath}:`, error);
                }
            }
            
        } catch (globError) {
            console.error(`Error with versioned glob import:`, globError);
            
            // Fallback to non-versioned specs
            console.log('Falling back to non-versioned API specs...');
            return loadLegacyApiSpecs(language);
        }

        // Update cache
        apiSpecCache = {
            specs: specs,
            lastUpdated: Date.now()
        };

        console.log(`Successfully loaded ${specs.length} versioned API specs`);
        return specs;
        
    } catch (error) {
        console.error('Error loading versioned API specs:', error);
        return [];
    }
}

/**
 * Fallback function to load legacy (non-versioned) API specs
 */
async function loadLegacyApiSpecs(language: string = 'en'): Promise<DynamicApiSpec[]> {
    try {
        const specs: DynamicApiSpec[] = [];
        
        // Import all non-versioned YAML files as text
        const yamlModules = import.meta.glob('/src/content/docs/*/apispecs/*.{yaml,yml}', {
            query: '?raw',
            import: 'default',
            eager: true
        });
        
        // Filter for the specific language
        const languageFiles = Object.entries(yamlModules).filter(([path]) => 
            path.includes(`/docs/${language}/apispecs/`)
        );
        
        console.log(`Found ${languageFiles.length} legacy files for language ${language}`);
        
        for (const [filePath, fileContent] of languageFiles) {
            try {
                console.log(`Processing legacy spec: ${filePath}`);
                
                // Extract filename from path
                const fileName = filePath.split('/').pop() || '';
                const specId = fileName.replace(/\.(yaml|yml)$/, '');
                
                // Parse YAML content
                let spec: any;
                try {
                    spec = parse(fileContent as string);
                } catch (parseError) {
                    console.error(`Failed to parse YAML for ${fileName}:`, parseError);
                    continue;
                }
                
                if (!spec || !spec.info) {
                    console.warn(`Invalid OpenAPI spec in ${fileName}: missing info section`);
                    continue;
                }
                
                // Extract operations
                const operations = extractOperationsFromSpec(spec, specId);
                
                const dynamicSpec: DynamicApiSpec = {
                    id: specId,
                    fileName,
                    title: spec.info.title || specId,
                    description: spec.info.description,
                    version: spec.info.version || '1.0.0',  
                    serviceName: formatServiceName(specId),
                    operations,
                    spec,
                    language
                };
                
                specs.push(dynamicSpec);
                console.log(`Loaded legacy spec: ${dynamicSpec.title} with ${operations.length} operations`);
                
            } catch (error) {
                console.error(`Error processing legacy spec ${filePath}:`, error);
            }
        }
        
        return specs;
        
    } catch (error) {
        console.error('Error loading legacy API specs:', error);
        return [];
    }
}

/**
 * Extract operations from an OpenAPI spec
 */
function extractOperationsFromSpec(spec: any, specId: string): DynamicApiOperation[] {
    const operations: DynamicApiOperation[] = [];
    
    if (!spec.paths) {
        console.warn(`No paths found in spec ${specId}`);
        return operations;
    }
    
    Object.entries(spec.paths).forEach(([path, pathItem]: [string, any]) => {
        if (!pathItem || typeof pathItem !== 'object') return;
        
        // HTTP methods to check
        const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];
        
        methods.forEach(method => {
            const operation = pathItem[method];
            if (!operation || typeof operation !== 'object') return;
            
            const operationId = operation.operationId || 
                               generateOperationId(method, path);
            
            operations.push({
                operationId,
                method: method.toUpperCase(),
                path,
                summary: operation.summary || `${method.toUpperCase()} ${path}`,
                description: operation.description,
                tags: operation.tags || [],
                markdownContent: generateOperationMarkdown(operation, method, path, spec)
            });
        });
    });
    
    return operations.sort((a, b) => a.summary.localeCompare(b.summary));
}

/**
 * Generate an operation ID if not provided
 */
function generateOperationId(method: string, path: string): string {
    const cleanPath = path
        .replace(/[{}]/g, '') // Remove path parameters braces
        .replace(/[^a-zA-Z0-9]/g, '_') // Replace non-alphanumeric with underscore
        .replace(/_+/g, '_') // Replace multiple underscores with single
        .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
        
    return `${method}_${cleanPath}`;
}

/**
 * Format service name for display
 */
function formatServiceName(specId: string): string {
    return specId
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
        .replace(/Api$/, 'API'); // Replace 'Api' with 'API' at the end
}

/**
 * Generate HTML documentation for an operation
 */
function generateOperationMarkdown(operation: any, method: string, path: string, spec: any): string {
    let html = `<h1>${operation.summary || `${method.toUpperCase()} ${path}`}</h1>\n\n`;
    
    if (operation.description) {
        html += `<p>${operation.description}</p>\n\n`;
    }
    
    // Method and path
    html += `<pre><code class="language-http">${method.toUpperCase()} ${path}</code></pre>\n\n`;
    
    // Tags
    if (operation.tags && operation.tags.length > 0) {
        html += `<p><strong>Tags:</strong> ${operation.tags.join(', ')}</p>\n\n`;
    }
    
    // Parameters
    if (operation.parameters && Array.isArray(operation.parameters) && operation.parameters.length > 0) {
        html += `<h2>Parameters</h2>\n\n`;
        html += `<table>\n`;
        html += `<thead><tr><th>Name</th><th>Type</th><th>In</th><th>Required</th><th>Description</th></tr></thead>\n`;
        html += `<tbody>\n`;
        
        operation.parameters.forEach((param: any) => {
            const type = param.schema?.type || 'string';
            const required = param.required ? '✅' : '❌';
            const description = param.description || '';
            
            html += `<tr><td><code>${param.name}</code></td><td><code>${type}</code></td><td><code>${param.in}</code></td><td>${required}</td><td>${description}</td></tr>\n`;
        });
        
        html += `</tbody></table>\n\n`;
    }
    
    // Request Body
    if (operation.requestBody) {
        html += `<h2>Request Body</h2>\n\n`;
        
        if (operation.requestBody.description) {
            html += `<p>${operation.requestBody.description}</p>\n\n`;
        }
        
        if (operation.requestBody.content) {
            Object.entries(operation.requestBody.content).forEach(([contentType, mediaType]: [string, any]) => {
                html += `<h3><code>${contentType}</code></h3>\n\n`;
                
                if (mediaType.example) {
                    html += '<pre><code class="language-json">';
                    html += JSON.stringify(mediaType.example, null, 2);
                    html += '</code></pre>\n\n';
                } else if (mediaType.schema) {
                    html += '<pre><code class="language-json">';
                    html += JSON.stringify(generateExampleFromSchema(mediaType.schema, spec), null, 2);
                    html += '</code></pre>\n\n';
                }
            });
        }
    }
    
    // Responses
    if (operation.responses) {
        html += `<h2>Responses</h2>\n\n`;
        
        Object.entries(operation.responses).forEach(([statusCode, response]: [string, any]) => {
            html += `<h3>${statusCode}</h3>\n\n`;
            html += `<p>${response.description}</p>\n\n`;
            
            if (response.content) {
                Object.entries(response.content).forEach(([contentType, mediaType]: [string, any]) => {
                    html += `<h4><code>${contentType}</code></h4>\n\n`;
                    
                    if (mediaType.example) {
                        html += '<pre><code class="language-json">';
                        html += JSON.stringify(mediaType.example, null, 2);
                        html += '</code></pre>\n\n';
                    } else if (mediaType.schema) {
                        html += '<pre><code class="language-json">';
                        html += JSON.stringify(generateExampleFromSchema(mediaType.schema, spec), null, 2);
                        html += '</code></pre>\n\n';
                    }
                });
            }
        });
    }
    
    return html;
}

/**
 * Generate example from schema
 */
function generateExampleFromSchema(schema: any, spec: any): any {
    if (!schema) return null;
    
    if (schema.example !== undefined) {
        return schema.example;
    }
    
    if (schema.$ref) {
        // Resolve reference
        const refPath = schema.$ref.replace('#/', '').split('/');
        let resolvedSchema = spec;
        for (const part of refPath) {
            resolvedSchema = resolvedSchema?.[part];
            if (!resolvedSchema) return null;
        }
        return generateExampleFromSchema(resolvedSchema, spec);
    }
    
    switch (schema.type) {
        case 'string':
            if (schema.format === 'email') return 'user@example.com';
            if (schema.format === 'date-time') return '2024-01-01T00:00:00Z';
            if (schema.format === 'date') return '2024-01-01';
            if (schema.enum) return schema.enum[0];
            return 'string';
        
        case 'number':
        case 'integer':
            return schema.default !== undefined ? schema.default : 0;
        
        case 'boolean':
            return schema.default !== undefined ? schema.default : false;
        
        case 'array':
            if (schema.items) {
                return [generateExampleFromSchema(schema.items, spec)];
            }
            return [];
        
        case 'object':
            if (schema.properties) {
                const example: Record<string, any> = {};
                Object.entries(schema.properties).forEach(([propName, propSchema]) => {
                    example[propName] = generateExampleFromSchema(propSchema, spec);
                });
                return example;
            }
            return {};
        
        default:
            return null;
    }
}

/**
 * Get a specific API spec by ID
 */
export async function getApiSpecById(specId: string, language: string = 'en', version: string = 'v3'): Promise<DynamicApiSpec | null> {
    const specs = await loadAllApiSpecs(language, version);
    return specs.find(spec => spec.id === specId) || null;
}

/**
 * Get a specific operation by spec ID and operation ID
 */
export async function getApiOperation(specId: string, operationId: string, language: string = 'en'): Promise<DynamicApiOperation | null> {
    const spec = await getApiSpecById(specId, language);
    if (!spec) return null;
    
    return spec.operations.find(op => op.operationId === operationId) || null;
}

/**
 * Get API specs formatted for header dropdown using recursive folder scanning
 */
export async function getApiSpecsForHeader(language: string = 'en', version: string = 'v3'): Promise<Array<{
    id: string;
    title: string;
    path: string;
    serviceName: string;
    operations: Array<{
        operationId: string;
        summary: string;
        path: string;
    }>;
}>> {
    try {
        console.log(`Loading header API specs for language: ${language}, version: ${version}`);
        
        const headerSpecs: Array<{
            id: string;
            title: string;
            path: string;
            serviceName: string;
            operations: Array<{
                operationId: string;
                summary: string;
                path: string;
            }>;
        }> = [];
        
        // Use recursive folder scanning strategy
        const yamlModules = import.meta.glob('/src/content/docs/*/apispecs/**/*.{yaml,yml}', {
            query: '?raw',
            import: 'default',
            eager: true
        });
        
        console.log(`Found ${Object.keys(yamlModules).length} total API files`);
        
        // Track processed services to avoid duplicates
        const processedServices = new Set<string>();
        
        // Filter for the specific language and version, then process each service
        const languageVersionFiles = Object.entries(yamlModules).filter(([path]) => {
            const hasLanguage = path.includes(`/docs/${language}/apispecs/`);
            const hasVersion = path.includes(`/${version}/`);
            return hasLanguage && hasVersion;
        });
        
        console.log(`Found ${languageVersionFiles.length} files for language ${language}, version ${version}`);
        
        for (const [filePath, fileContent] of languageVersionFiles) {
            try {
                // Extract service name from path
                // Path format: /src/content/docs/en/apispecs/payment-api/v2/payment-openapi.yaml
                const pathMatch = filePath.match(/\/apispecs\/([^\/]+)\/([^\/]+)\/([^\/]+)$/);
                if (!pathMatch) {
                    console.warn(`Could not parse path format: ${filePath}`);
                    continue;
                }
                
                const [, serviceName, versionDir, fileName] = pathMatch;
                
                // Skip if we already processed this service
                if (processedServices.has(serviceName)) {
                    continue;
                }
                processedServices.add(serviceName);
                
                console.log(`Processing service: ${serviceName} from ${filePath}`);
                
                // Parse YAML content
                let spec: any;
                try {
                    spec = parse(fileContent as string);
                } catch (parseError) {
                    console.error(`Failed to parse YAML for ${fileName}:`, parseError);
                    continue;
                }
                
                if (!spec || !spec.info) {
                    console.warn(`Invalid OpenAPI spec in ${fileName}: missing info section`);
                    continue;
                }
                
                // Extract operations
                const operations = extractOperationsFromSpec(spec, serviceName);
                
                // Create header spec entry
                const headerSpec = {
                    id: serviceName,
                    title: spec.info.title || formatServiceName(serviceName),
                    path: `/api/${serviceName}?version=${version}&lang=${language}`,
                    serviceName: formatServiceName(serviceName),
                    operations: operations.slice(0, 8).map(op => ({ // Limit to 8 operations for header
                        operationId: op.operationId,
                        summary: op.summary,
                        path: `/api/${serviceName}/${op.operationId}?version=${version}&lang=${language}`
                    }))
                };
                
                headerSpecs.push(headerSpec);
                console.log(`Added header spec: ${headerSpec.title} with ${headerSpec.operations.length} operations`);
                
            } catch (error) {
                console.error(`Error processing header spec ${filePath}:`, error);
            }
        }
        
        // Fallback: if no versioned specs found, try to load legacy specs
        if (headerSpecs.length === 0) {
            console.log('No versioned specs found, trying legacy specs...');
            return getApiSpecsForHeaderLegacy(language);
        }
        
        console.log(`Successfully loaded ${headerSpecs.length} header API specs`);
        return headerSpecs;
        
    } catch (error) {
        console.error('Error loading header API specs:', error);
        return [];
    }
}

/**
 * Fallback function to get API specs for header from legacy (non-versioned) structure
 */
async function getApiSpecsForHeaderLegacy(language: string = 'en'): Promise<Array<{
    id: string;
    title: string;
    path: string;
    serviceName: string;
    operations: Array<{
        operationId: string;
        summary: string;
        path: string;
    }>;
}>> {
    try {
        console.log(`Loading legacy header API specs for language: ${language}`);
        
        const legacySpecs = await loadLegacyApiSpecs(language);
        
        return legacySpecs.map(spec => ({
            id: spec.id,
            title: spec.title,
            path: `/api/${spec.id}?lang=${language}`,
            serviceName: spec.serviceName,
            operations: spec.operations.slice(0, 8).map(op => ({
                operationId: op.operationId,
                summary: op.summary,
                path: `/api/${spec.id}/${op.operationId}?lang=${language}`
            }))
        }));
        
    } catch (error) {
        console.error('Error loading legacy header API specs:', error);
        return [];
    }
}

/**
 * Clear the cache (useful for development)
 */
export function clearApiSpecCache(): void {
    apiSpecCache = null;
}