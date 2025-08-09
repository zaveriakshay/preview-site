// OpenAPI Spec Parser and Renderer
export interface OpenAPISpec {
    openapi: string;
    info: {
        title: string;
        description?: string;
        version: string;
    };
    servers?: Array<{
        url: string;
        description?: string;
    }>;
    paths: Record<string, PathItem>;
    components?: {
        schemas?: Record<string, any>;
        securitySchemes?: Record<string, any>;
    };
}

export interface PathItem {
    get?: Operation;
    post?: Operation;
    put?: Operation;
    delete?: Operation;
    patch?: Operation;
    options?: Operation;
    head?: Operation;
    trace?: Operation;
}

export interface Operation {
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: Parameter[];
    requestBody?: RequestBody;
    responses: Record<string, Response>;
    security?: Array<Record<string, string[]>>;
}

export interface Parameter {
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie';
    description?: string;
    required?: boolean;
    schema?: any;
    example?: any;
}

export interface RequestBody {
    description?: string;
    required?: boolean;
    content: Record<string, MediaType>;
}

export interface MediaType {
    schema?: any;
    example?: any;
    examples?: Record<string, any>;
}

export interface Response {
    description: string;
    content?: Record<string, MediaType>;
    headers?: Record<string, any>;
}

export interface ApiOperation {
    operationId: string;
    method: string;
    path: string;
    summary: string;
    description?: string;
    tags: string[];
    serviceName: string;
    spec: OpenAPISpec;
}

/**
 * Load and parse OpenAPI spec from a file or URL
 */
export async function loadApiSpec(specPath: string): Promise<OpenAPISpec | null> {
    try {
        // In a real implementation, you'd load from various sources
        // For now, we'll simulate loading from public folder
        const response = await fetch(specPath);
        if (!response.ok) {
            throw new Error(`Failed to load spec: ${response.statusText}`);
        }
        
        const spec = await response.json();
        return spec as OpenAPISpec;
    } catch (error) {
        console.error('Error loading API spec:', error);
        return null;
    }
}

/**
 * Extract all operations from an OpenAPI spec
 */
export function extractOperations(spec: OpenAPISpec, serviceName: string): ApiOperation[] {
    const operations: ApiOperation[] = [];
    
    Object.entries(spec.paths).forEach(([path, pathItem]) => {
        Object.entries(pathItem).forEach(([method, operation]) => {
            if (typeof operation === 'object' && operation !== null) {
                const op = operation as Operation;
                
                operations.push({
                    operationId: op.operationId || `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
                    method: method.toUpperCase(),
                    path,
                    summary: op.summary || `${method.toUpperCase()} ${path}`,
                    description: op.description,
                    tags: op.tags || [],
                    serviceName,
                    spec
                });
            }
        });
    });
    
    return operations;
}

/**
 * Get all available API specs and their operations
 */
export async function getAllApiOperations(language: string = 'en'): Promise<Record<string, ApiOperation[]>> {
    const services: Record<string, ApiOperation[]> = {};
    
    try {
        // In a real implementation, you'd scan the apispecs folder
        // For demo, we'll define some mock specs
        const mockSpecs = [
            { name: 'payment-api', path: '/apispecs/payment-api.json' },
            { name: 'wallet-api', path: '/apispecs/wallet-api.json' },
            { name: 'user-api', path: '/apispecs/user-api.json' }
        ];
        
        for (const mockSpec of mockSpecs) {
            // Try to load each spec
            const spec = await loadApiSpec(mockSpec.path);
            if (spec) {
                const operations = extractOperations(spec, mockSpec.name);
                if (operations.length > 0) {
                    services[mockSpec.name] = operations;
                }
            }
        }
        
        return services;
    } catch (error) {
        console.error('Error getting API operations:', error);
        return {};
    }
}

/**
 * Find a specific operation by ID
 */
export async function findOperation(operationId: string, serviceName?: string): Promise<ApiOperation | null> {
    const allOperations = await getAllApiOperations();
    
    for (const [service, operations] of Object.entries(allOperations)) {
        if (serviceName && service !== serviceName) continue;
        
        const operation = operations.find(op => op.operationId === operationId);
        if (operation) {
            return operation;
        }
    }
    
    return null;
}

/**
 * Generate markdown documentation for an operation
 */
export function generateOperationMarkdown(operation: ApiOperation): string {
    const { method, path, summary, description, spec } = operation;
    const pathItem = spec.paths[path];
    const operationDetails = pathItem[method.toLowerCase() as keyof PathItem] as Operation;
    
    let markdown = `# ${summary}\n\n`;
    
    if (description) {
        markdown += `${description}\n\n`;
    }
    
    // Method and path
    markdown += `**${method}** \`${path}\`\n\n`;
    
    // Parameters
    if (operationDetails.parameters && operationDetails.parameters.length > 0) {
        markdown += `## Parameters\n\n`;
        markdown += `| Name | Type | In | Required | Description |\n`;
        markdown += `|------|------|----|---------|-----------|\n`;
        
        operationDetails.parameters.forEach(param => {
            const type = param.schema?.type || 'string';
            const required = param.required ? '✓' : '✗';
            const description = param.description || '';
            
            markdown += `| ${param.name} | ${type} | ${param.in} | ${required} | ${description} |\n`;
        });
        
        markdown += '\n';
    }
    
    // Request Body
    if (operationDetails.requestBody) {
        markdown += `## Request Body\n\n`;
        
        const requestBody = operationDetails.requestBody;
        if (requestBody.description) {
            markdown += `${requestBody.description}\n\n`;
        }
        
        Object.entries(requestBody.content).forEach(([contentType, mediaType]) => {
            markdown += `### ${contentType}\n\n`;
            
            if (mediaType.example) {
                markdown += '```json\n';
                markdown += JSON.stringify(mediaType.example, null, 2);
                markdown += '\n```\n\n';
            }
        });
    }
    
    // Responses
    markdown += `## Responses\n\n`;
    
    Object.entries(operationDetails.responses).forEach(([statusCode, response]) => {
        markdown += `### ${statusCode}\n\n`;
        markdown += `${response.description}\n\n`;
        
        if (response.content) {
            Object.entries(response.content).forEach(([contentType, mediaType]) => {
                markdown += `#### ${contentType}\n\n`;
                
                if (mediaType.example) {
                    markdown += '```json\n';
                    markdown += JSON.stringify(mediaType.example, null, 2);
                    markdown += '\n```\n\n';
                }
            });
        }
    });
    
    return markdown;
}

/**
 * Create a mock OpenAPI spec for demo purposes
 */
export function createMockPaymentSpec(): OpenAPISpec {
    return {
        openapi: '3.0.0',
        info: {
            title: 'Payment API',
            description: 'Noqodi Payment Processing API',
            version: '1.0.0'
        },
        servers: [
            {
                url: 'https://api.noqodi.com/v1',
                description: 'Production server'
            }
        ],
        paths: {
            '/payments': {
                get: {
                    operationId: 'listPayments',
                    summary: 'List all payments',
                    description: 'Retrieve a list of all payment transactions',
                    tags: ['Payments'],
                    parameters: [
                        {
                            name: 'limit',
                            in: 'query',
                            description: 'Number of payments to return',
                            required: false,
                            schema: { type: 'integer', default: 10 }
                        },
                        {
                            name: 'offset',
                            in: 'query',
                            description: 'Number of payments to skip',
                            required: false,
                            schema: { type: 'integer', default: 0 }
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'List of payments',
                            content: {
                                'application/json': {
                                    example: {
                                        payments: [
                                            {
                                                id: 'pay_123',
                                                amount: 1000,
                                                currency: 'AED',
                                                status: 'completed'
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    }
                },
                post: {
                    operationId: 'createPayment',
                    summary: 'Create a payment',
                    description: 'Create a new payment transaction',
                    tags: ['Payments'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                example: {
                                    amount: 1000,
                                    currency: 'AED',
                                    description: 'Payment for order #123'
                                }
                            }
                        }
                    },
                    responses: {
                        '201': {
                            description: 'Payment created successfully',
                            content: {
                                'application/json': {
                                    example: {
                                        id: 'pay_123',
                                        amount: 1000,
                                        currency: 'AED',
                                        status: 'pending'
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/payments/{id}': {
                get: {
                    operationId: 'getPayment',
                    summary: 'Get payment details',
                    description: 'Retrieve details of a specific payment',
                    tags: ['Payments'],
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            description: 'Payment ID',
                            schema: { type: 'string' }
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'Payment details',
                            content: {
                                'application/json': {
                                    example: {
                                        id: 'pay_123',
                                        amount: 1000,
                                        currency: 'AED',
                                        status: 'completed',
                                        created_at: '2024-01-01T00:00:00Z'
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    };
}