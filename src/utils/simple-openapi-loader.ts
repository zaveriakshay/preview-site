import { parse } from 'yaml';
import type { OpenAPIV3 } from 'openapi-types';
import fs from 'fs';
import path from 'path';

export interface SimpleApiSpec {
    id: string;
    title: string;
    description: string;
    version: string;
    language: string;
    folderVersion: string;
    spec: OpenAPIV3.Document;
    operations: SimpleApiOperation[];
    filePath: string;
}

export interface SimpleApiOperation {
    operationId: string;
    method: string;
    path: string;
    summary: string;
    description?: string;
    tags: string[];
}

export async function loadSimpleApiSpec(
    serviceName: string, 
    language: string = 'en', 
    version: string = 'v3'
): Promise<SimpleApiSpec | null> {
    try {
        console.log(`[Simple Loader] Loading: ${serviceName}, lang: ${language}, version: ${version}`);
        
        const basePath = path.join(process.cwd(), 'src', 'content', 'docs', language, 'apispecs', serviceName, version);
        
        if (!fs.existsSync(basePath)) {
            console.warn(`[Simple Loader] Directory not found: ${basePath}`);
            return null;
        }

        // Read all YAML files in the directory
        const files = fs.readdirSync(basePath).filter(file => 
            file.endsWith('.yaml') || file.endsWith('.yml')
        );

        if (files.length === 0) {
            console.warn(`[Simple Loader] No YAML files found in: ${basePath}`);
            return null;
        }

        console.log(`[Simple Loader] Found ${files.length} YAML files: ${files.join(', ')}`);

        // Try each YAML file until we find a valid OpenAPI spec
        for (const fileName of files) {
            const filePath = path.join(basePath, fileName);
            
            try {
                console.log(`[Simple Loader] Trying file: ${filePath}`);
                
                const content = fs.readFileSync(filePath, 'utf8');
                const spec = parse(content) as OpenAPIV3.Document;
                
                // Check if it's a valid OpenAPI spec
                if (!spec || !spec.info || !spec.openapi) {
                    console.warn(`[Simple Loader] Not a valid OpenAPI spec: ${fileName}`);
                    continue;
                }

                const operations: SimpleApiOperation[] = [];
                if (spec.paths) {
                    Object.entries(spec.paths).forEach(([pathStr, pathItem]) => {
                        if (!pathItem || typeof pathItem === 'string') return;
                        
                        const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
                        methods.forEach(method => {
                            const operation = pathItem[method];
                            if (operation && 'operationId' in operation) {
                                operations.push({
                                    operationId: operation.operationId || `${method}-${pathStr}`,
                                    method: method.toUpperCase(),
                                    path: pathStr,
                                    summary: operation.summary || '',
                                    description: operation.description,
                                    tags: operation.tags || []
                                });
                            }
                        });
                    });
                }

                console.log(`[Simple Loader] Successfully loaded ${fileName} with ${operations.length} operations`);

                return {
                    id: serviceName,
                    title: spec.info.title,
                    description: spec.info.description || '',
                    version: spec.info.version,
                    language,
                    folderVersion: version,
                    spec,
                    operations,
                    filePath
                };
            } catch (error) {
                console.error(`[Simple Loader] Error reading ${fileName}:`, error);
                continue;
            }
        }

        console.error(`[Simple Loader] No valid OpenAPI spec found for ${serviceName} (${language}/${version})`);
        return null;
    } catch (error) {
        console.error(`[Simple Loader] Error:`, error);
        return null;
    }
}

// Discover all services and versions dynamically
export function discoverApiServices(): { languages: string[], services: string[], versions: string[] } {
    const basePath = path.join(process.cwd(), 'src', 'content', 'docs');
    const languages: string[] = [];
    const services: string[] = [];
    const versions: string[] = [];
    
    try {
        if (!fs.existsSync(basePath)) {
            console.warn(`[Simple Loader] Base path not found: ${basePath}`);
            return { languages: ['en'], services: [], versions: ['v3'] };
        }

        // Discover languages
        const langDirs = fs.readdirSync(basePath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        languages.push(...langDirs);
        console.log(`[Simple Loader] Discovered languages: ${languages.join(', ')}`);

        // For each language, discover services and versions
        for (const lang of languages) {
            const apispecsPath = path.join(basePath, lang, 'apispecs');
            
            if (!fs.existsSync(apispecsPath)) continue;

            // Discover services
            const serviceDirs = fs.readdirSync(apispecsPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            
            serviceDirs.forEach(service => {
                if (!services.includes(service)) {
                    services.push(service);
                }
            });

            // Discover versions for each service
            for (const service of serviceDirs) {
                const servicePath = path.join(apispecsPath, service);
                
                if (!fs.existsSync(servicePath)) continue;

                const versionDirs = fs.readdirSync(servicePath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
                
                versionDirs.forEach(version => {
                    if (!versions.includes(version)) {
                        versions.push(version);
                    }
                });
            }
        }

        console.log(`[Simple Loader] Discovered services: ${services.join(', ')}`);
        console.log(`[Simple Loader] Discovered versions: ${versions.join(', ')}`);

        return { 
            languages: languages.length > 0 ? languages : ['en'], 
            services, 
            versions: versions.length > 0 ? versions : ['v3'] 
        };
    } catch (error) {
        console.error(`[Simple Loader] Error discovering services:`, error);
        return { languages: ['en'], services: [], versions: ['v3'] };
    }
}

export async function loadAllSimpleApiSpecs(): Promise<SimpleApiSpec[]> {
    console.log(`[Simple Loader] Starting dynamic discovery of API specs...`);
    
    const specs: SimpleApiSpec[] = [];
    const { languages, services, versions } = discoverApiServices();

    if (services.length === 0) {
        console.warn(`[Simple Loader] No services discovered`);
        return specs;
    }

    for (const language of languages) {
        for (const service of services) {
            for (const version of versions) {
                try {
                    const spec = await loadSimpleApiSpec(service, language, version);
                    if (spec) {
                        specs.push(spec);
                        console.log(`[Simple Loader] Added spec: ${service} (${language}/${version})`);
                    }
                } catch (error) {
                    console.error(`[Simple Loader] Error loading ${service} (${language}/${version}):`, error);
                }
            }
        }
    }

    console.log(`[Simple Loader] Dynamically loaded ${specs.length} total specs`);
    return specs;
}