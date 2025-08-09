export interface OperationData {
    method: string;
    path: string;
    operationId?: string;
    summary?: string;
    description?: string;
    requestBody?: any;
    parameters?: Parameter[];
    responses?: Record<string, any>;
    security?: SecurityRequirement[];
    servers?: Server[];
}

export interface Parameter {
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie';
    required?: boolean;
    schema?: any;
    description?: string;
    example?: any;
}

export interface SecurityRequirement {
    [key: string]: string[];
}

export interface Server {
    url: string;
    description?: string;
    variables?: Record<string, any>;
}

export interface CodeGenerationData {
    method: string;
    path: string;
    serverUrl: string;
    requestBody?: any;
    parameters?: Parameter[];
    headers?: Record<string, string>;
    operationId?: string;
    summary?: string;
}

export class OpenAPICodeExtractor {
    private spec: any;
    private defaultServer: string;

    constructor(spec: any, defaultServer?: string) {
        this.spec = spec;
        this.defaultServer = defaultServer || this.getDefaultServer();
    }

    private getDefaultServer(): string {
        if (this.spec.servers && this.spec.servers.length > 0) {
            const server = this.spec.servers[0];
            let url = server.url;
            
            if (server.variables) {
                Object.entries(server.variables).forEach(([key, variable]: [string, any]) => {
                    const placeholder = `{${key}}`;
                    if (url.includes(placeholder)) {
                        url = url.replace(placeholder, variable.default || variable.enum?.[0] || '');
                    }
                });
            }
            
            if (!url.startsWith('http')) {
                url = `https://${url}`;
            }
            
            return url;
        }
        return 'https://api.example.com';
    }

    public extractOperation(path: string, method: string): OperationData | null {
        const pathItem = this.spec.paths?.[path];
        if (!pathItem) return null;

        const operation = pathItem[method.toLowerCase()];
        if (!operation) return null;

        return {
            method: method.toUpperCase(),
            path,
            operationId: operation.operationId,
            summary: operation.summary,
            description: operation.description,
            requestBody: operation.requestBody,
            parameters: [
                ...(pathItem.parameters || []),
                ...(operation.parameters || [])
            ],
            responses: operation.responses,
            security: operation.security || this.spec.security,
            servers: operation.servers || pathItem.servers || this.spec.servers
        };
    }

    public generateCodeData(operation: OperationData): CodeGenerationData {
        const serverUrl = this.getServerUrl(operation.servers);
        const headers = this.generateHeaders(operation);
        const requestBody = this.generateRequestBody(operation);
        const parameters = this.extractParameters(operation);

        let fullPath = operation.path;
        
        // Replace path parameters with example values
        if (parameters) {
            parameters.forEach(param => {
                if (param.in === 'path' && param.example) {
                    fullPath = fullPath.replace(`{${param.name}}`, String(param.example));
                } else if (param.in === 'path') {
                    // Generate example based on schema type
                    const exampleValue = this.generateExampleValue(param.schema);
                    fullPath = fullPath.replace(`{${param.name}}`, String(exampleValue));
                }
            });
        }

        return {
            method: operation.method,
            path: fullPath,
            serverUrl,
            requestBody,
            parameters,
            headers,
            operationId: operation.operationId,
            summary: operation.summary
        };
    }

    private getServerUrl(servers?: Server[]): string {
        if (servers && servers.length > 0) {
            const server = servers[0];
            let url = server.url;
            
            if (server.variables) {
                Object.entries(server.variables).forEach(([key, variable]: [string, any]) => {
                    const placeholder = `{${key}}`;
                    if (url.includes(placeholder)) {
                        url = url.replace(placeholder, variable.default || variable.enum?.[0] || '');
                    }
                });
            }
            
            if (!url.startsWith('http')) {
                url = `https://${url}`;
            }
            
            return url;
        }
        return this.defaultServer;
    }

    private generateHeaders(operation: OperationData): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // Add security headers
        if (operation.security) {
            operation.security.forEach(secReq => {
                Object.keys(secReq).forEach(secName => {
                    const secScheme = this.spec.components?.securitySchemes?.[secName];
                    if (secScheme) {
                        if (secScheme.type === 'http' && secScheme.scheme === 'bearer') {
                            headers['Authorization'] = 'Bearer YOUR_ACCESS_TOKEN';
                        } else if (secScheme.type === 'apiKey') {
                            if (secScheme.in === 'header') {
                                headers[secScheme.name] = 'YOUR_API_KEY';
                            }
                        }
                    }
                });
            });
        }

        // Add parameter headers
        if (operation.parameters) {
            operation.parameters.forEach(param => {
                if (param.in === 'header' && param.required) {
                    const exampleValue = param.example || this.generateExampleValue(param.schema);
                    headers[param.name] = String(exampleValue);
                }
            });
        }

        return headers;
    }

    private generateRequestBody(operation: OperationData): any {
        if (!operation.requestBody) return null;

        const content = operation.requestBody.content;
        if (!content) return null;

        // Try to get JSON content first
        const jsonContent = content['application/json'];
        if (jsonContent && jsonContent.schema) {
            return this.generateExampleFromSchema(jsonContent.schema);
        }

        // Fall back to first available content type
        const firstContentType = Object.keys(content)[0];
        if (firstContentType && content[firstContentType].schema) {
            return this.generateExampleFromSchema(content[firstContentType].schema);
        }

        return null;
    }

    private extractParameters(operation: OperationData): Parameter[] {
        if (!operation.parameters) return [];

        return operation.parameters.map(param => ({
            name: param.name,
            in: param.in,
            required: param.required,
            schema: param.schema,
            description: param.description,
            example: param.example || this.generateExampleValue(param.schema)
        }));
    }

    private generateExampleFromSchema(schema: any): any {
        if (!schema) return null;

        // If example is provided, use it
        if (schema.example !== undefined) {
            return schema.example;
        }

        // Handle references
        if (schema.$ref) {
            const refPath = schema.$ref.replace('#/', '').split('/');
            let refSchema = this.spec;
            for (const segment of refPath) {
                refSchema = refSchema[segment];
            }
            return this.generateExampleFromSchema(refSchema);
        }

        // Handle different types
        switch (schema.type) {
            case 'object':
                const obj: any = {};
                if (schema.properties) {
                    Object.entries(schema.properties).forEach(([key, propSchema]: [string, any]) => {
                        // Only include required properties or provide examples for all
                        if (schema.required?.includes(key) || !schema.required) {
                            obj[key] = this.generateExampleFromSchema(propSchema);
                        }
                    });
                }
                return obj;

            case 'array':
                if (schema.items) {
                    return [this.generateExampleFromSchema(schema.items)];
                }
                return [];

            case 'string':
                if (schema.enum) return schema.enum[0];
                if (schema.format === 'email') return 'user@example.com';
                if (schema.format === 'date') return '2024-01-15';
                if (schema.format === 'date-time') return '2024-01-15T10:30:00Z';
                if (schema.format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
                return 'string_value';

            case 'number':
            case 'integer':
                if (schema.enum) return schema.enum[0];
                return schema.minimum || 0;

            case 'boolean':
                return true;

            default:
                return null;
        }
    }

    private generateExampleValue(schema: any): any {
        if (!schema) return 'example_value';

        switch (schema.type) {
            case 'string':
                if (schema.format === 'email') return 'user@example.com';
                if (schema.format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
                return 'example_string';
            case 'number':
            case 'integer':
                return 123;
            case 'boolean':
                return true;
            default:
                return 'example_value';
        }
    }

    public getAllOperations(): OperationData[] {
        const operations: OperationData[] = [];

        if (!this.spec.paths) return operations;

        Object.entries(this.spec.paths).forEach(([path, pathItem]: [string, any]) => {
            ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].forEach(method => {
                if (pathItem[method]) {
                    const operation = this.extractOperation(path, method);
                    if (operation) {
                        operations.push(operation);
                    }
                }
            });
        });

        return operations;
    }
}