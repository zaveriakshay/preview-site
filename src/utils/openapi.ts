// OpenAPI dynamic parser and renderer
export interface OpenAPISpec {
    openapi: string;
    info: {
        title: string;
        description?: string;
        version: string;
        contact?: {
            name?: string;
            email?: string;
        };
    };
    servers?: Array<{
        url: string;
        description?: string;
    }>;
    paths: Record<string, Record<string, OpenAPIOperation>>;
    components?: {
        schemas?: Record<string, OpenAPISchema>;
    };
}

export interface OpenAPIOperation {
    operationId: string;
    summary: string;
    description?: string;
    tags?: string[];
    parameters?: OpenAPIParameter[];
    requestBody?: {
        required?: boolean;
        content: Record<string, {
            schema: OpenAPISchema | { $ref: string };
        }>;
    };
    responses: Record<string, {
        description: string;
        content?: Record<string, {
            schema: OpenAPISchema | { $ref: string };
        }>;
    }>;
}

export interface OpenAPIParameter {
    name: string;
    in: 'query' | 'path' | 'header' | 'cookie';
    required?: boolean;
    description?: string;
    schema: OpenAPISchema;
}

export interface OpenAPISchema {
    type?: string;
    format?: string;
    description?: string;
    enum?: string[];
    properties?: Record<string, OpenAPISchema>;
    items?: OpenAPISchema;
    required?: string[];
    example?: any;
    minimum?: number;
    maximum?: number;
    default?: any;
    $ref?: string;
}

export interface ApiSpec {
    id: string;
    title: string;
    serviceName: string;
    operations: ApiOperation[];
    spec: OpenAPISpec;
}

export interface ApiOperation {
    operationId: string;
    method: string;
    path: string;
    summary: string;
    description?: string;
    tags: string[];
}

/**
 * Load and parse all available OpenAPI specs
 */
export async function loadApiSpecs(): Promise<ApiSpec[]> {
    const specs: ApiSpec[] = [];
    
    try {
        // List of available spec files (in a real app, this could be dynamic)
        const specFiles = [
            'payment-api.json',
            'wallet-api.json'
        ];

        for (const fileName of specFiles) {
            try {
                const response = await fetch(`/apispecs/${fileName}`);
                if (!response.ok) continue;
                
                const spec: OpenAPISpec = await response.json();
                const specId = fileName.replace('.json', '');
                
                const operations = extractOperations(spec);
                
                specs.push({
                    id: specId,
                    title: spec.info.title,
                    serviceName: formatServiceName(specId),
                    operations,
                    spec
                });
            } catch (error) {
                console.error(`Error loading spec ${fileName}:`, error);
            }
        }
    } catch (error) {
        console.error('Error loading API specs:', error);
    }

    return specs;
}

/**
 * Get a specific API spec by ID
 */
export async function getApiSpec(specId: string): Promise<ApiSpec | null> {
    try {
        const response = await fetch(`/apispecs/${specId}.json`);
        if (!response.ok) return null;
        
        const spec: OpenAPISpec = await response.json();
        const operations = extractOperations(spec);
        
        return {
            id: specId,
            title: spec.info.title,
            serviceName: formatServiceName(specId),
            operations,
            spec
        };
    } catch (error) {
        console.error(`Error loading spec ${specId}:`, error);
        return null;
    }
}

/**
 * Get a specific operation from a spec
 */
export async function getApiOperation(specId: string, operationId: string): Promise<{
    spec: ApiSpec;
    operation: OpenAPIOperation;
    method: string;
    path: string;
} | null> {
    const spec = await getApiSpec(specId);
    if (!spec) return null;

    // Find the operation in the spec
    for (const [path, methods] of Object.entries(spec.spec.paths)) {
        for (const [method, operation] of Object.entries(methods)) {
            if (operation.operationId === operationId) {
                return {
                    spec,
                    operation,
                    method: method.toUpperCase(),
                    path
                };
            }
        }
    }

    return null;
}

/**
 * Extract all operations from an OpenAPI spec
 */
function extractOperations(spec: OpenAPISpec): ApiOperation[] {
    const operations: ApiOperation[] = [];

    for (const [path, methods] of Object.entries(spec.paths)) {
        for (const [method, operation] of Object.entries(methods)) {
            if (operation.operationId) {
                operations.push({
                    operationId: operation.operationId,
                    method: method.toUpperCase(),
                    path,
                    summary: operation.summary,
                    description: operation.description,
                    tags: operation.tags || []
                });
            }
        }
    }

    return operations.sort((a, b) => a.summary.localeCompare(b.summary));
}

/**
 * Format service name for display
 */
function formatServiceName(specId: string): string {
    return specId
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Resolve schema references
 */
export function resolveSchemaRef(ref: string, spec: OpenAPISpec): OpenAPISchema | null {
    if (!ref.startsWith('#/components/schemas/')) return null;
    
    const schemaName = ref.replace('#/components/schemas/', '');
    return spec.components?.schemas?.[schemaName] || null;
}

/**
 * Generate example from schema
 */
export function generateExample(schema: OpenAPISchema | { $ref: string }, spec: OpenAPISpec): any {
    if ('$ref' in schema) {
        const resolvedSchema = resolveSchemaRef(schema.$ref, spec);
        if (!resolvedSchema) return null;
        return generateExample(resolvedSchema, spec);
    }

    if (schema.example !== undefined) {
        return schema.example;
    }

    switch (schema.type) {
        case 'string':
            if (schema.format === 'email') return 'user@example.com';
            if (schema.format === 'date-time') return '2023-12-01T10:00:00Z';
            if (schema.enum) return schema.enum[0];
            return 'string';
        
        case 'number':
        case 'integer':
            return schema.default || 0;
        
        case 'boolean':
            return schema.default || false;
        
        case 'array':
            if (schema.items) {
                return [generateExample(schema.items, spec)];
            }
            return [];
        
        case 'object':
            if (schema.properties) {
                const example: Record<string, any> = {};
                for (const [propName, propSchema] of Object.entries(schema.properties)) {
                    example[propName] = generateExample(propSchema, spec);
                }
                return example;
            }
            return {};
        
        default:
            return null;
    }
}

/**
 * Format HTTP method for display
 */
export function formatHttpMethod(method: string): string {
    const colors: Record<string, string> = {
        'GET': 'text-blue-600',
        'POST': 'text-green-600',
        'PUT': 'text-orange-600',
        'DELETE': 'text-red-600',
        'PATCH': 'text-purple-600'
    };

    return `<span class="${colors[method] || 'text-gray-600'} font-bold">${method}</span>`;
}

/**
 * Get available API specs for header dropdown
 */
export async function getApiSpecsForHeader(): Promise<Array<{
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
    const specs = await loadApiSpecs();
    
    return specs.map(spec => ({
        id: spec.id,
        title: spec.title,
        path: `/api/${spec.id}`,
        serviceName: spec.serviceName,
        operations: spec.operations.map(op => ({
            operationId: op.operationId,
            summary: op.summary,
            path: `/api/${spec.id}/${op.operationId}`
        }))
    }));
}