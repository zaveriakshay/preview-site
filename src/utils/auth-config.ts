import fs from 'fs';
import path from 'path';

export interface AuthConfig {
    environment: string;
    version: string;
    keycloak: {
        baseUrl: string;
        realm: string;
        clientId: string;
        protocol: string;
        authEndpoint: string;
        responseType: string;
        scope: string;
    };
    redirect: {
        baseUrl: string;
        returnPath: string;
        welcomePath: string;
    };
    auth: {
        enabled: boolean;
        apiPagesRequireAuth: boolean;
        sdkPagesRequireAuth: boolean;
        guidesRequireAuth: boolean;
    };
    session: {
        timeout: number;
        refreshThreshold: number;
        storage: 'localStorage' | 'sessionStorage';
    };
    ui: {
        loginButtonText: Record<string, string>;
        signupButtonText: Record<string, string>;
        loginRequiredMessage: Record<string, string>;
    };
    debug: {
        enabled: boolean;
        logRedirects: boolean;
        logVisibilityChecks: boolean;
    };
}

export interface VisibilityRule {
    path: string;
    type: 'folder' | 'file';
    rule: 'public' | 'authenticated' | string; // role:ROLE_NAME
}

class AuthConfigManager {
    private config: AuthConfig | null = null;
    private visibilityRules: VisibilityRule[] = [];
    private configPath: string;

    constructor() {
        this.configPath = path.resolve(process.cwd(), 'application.properties');
    }

    async loadConfig(): Promise<AuthConfig> {
        if (this.config) {
            return this.config;
        }

        try {
            const configContent = fs.readFileSync(this.configPath, 'utf-8');
            const properties = this.parseProperties(configContent);
            
            this.config = this.buildAuthConfig(properties);
            this.visibilityRules = this.parseVisibilityRules(properties);
            
            if (this.config.debug.enabled) {
                console.log('Loaded auth configuration:', this.config);
                console.log('Loaded visibility rules:', this.visibilityRules);
            }
            
            return this.config;
        } catch (error) {
            console.error('Failed to load auth configuration:', error);
            return this.getDefaultConfig();
        }
    }

    private parseProperties(content: string): Record<string, string> {
        const properties: Record<string, string> = {};
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                const [key, ...valueParts] = trimmedLine.split('=');
                if (key && valueParts.length > 0) {
                    properties[key.trim()] = valueParts.join('=').trim();
                }
            }
        }

        return properties;
    }

    private buildAuthConfig(properties: Record<string, string>): AuthConfig {
        const environment = properties['app.environment'] || 'local';
        
        return {
            environment,
            version: properties['app.version'] || '1.0.0',
            keycloak: {
                baseUrl: properties[`keycloak.${environment}.base-url`] || properties['keycloak.local.base-url'] || 'http://localhost:8080',
                realm: properties['keycloak.realm'] || 'noqodi',
                clientId: properties['keycloak.client-id'] || 'ums-client',
                protocol: properties['keycloak.protocol'] || 'openid-connect',
                authEndpoint: properties['keycloak.auth-endpoint'] || '/realms/noqodi/protocol/openid-connect/auth',
                responseType: properties['keycloak.response-type'] || 'code',
                scope: properties['keycloak.scope'] || 'openid'
            },
            redirect: {
                baseUrl: properties[`redirect.${environment}.base-url`] || properties['redirect.local.base-url'] || 'http://localhost:4321',
                returnPath: properties[`redirect.${environment}.return-path`] || '/auth/callback',
                welcomePath: properties[`redirect.${environment}.welcome-path`] || '/en/welcome'
            },
            auth: {
                enabled: properties['auth.enabled'] === 'true',
                apiPagesRequireAuth: properties['auth.api-pages.require-auth'] === 'true',
                sdkPagesRequireAuth: properties['auth.sdk-pages.require-auth'] === 'true',
                guidesRequireAuth: properties['auth.guides.require-auth'] === 'true'
            },
            session: {
                timeout: parseInt(properties['session.timeout'] || '3600'),
                refreshThreshold: parseInt(properties['session.refresh-threshold'] || '300'),
                storage: (properties['session.storage'] as 'localStorage' | 'sessionStorage') || 'localStorage'
            },
            ui: {
                loginButtonText: {
                    en: properties['ui.login-button.text.en'] || 'Sign in',
                    ar: properties['ui.login-button.text.ar'] || 'تسجيل الدخول'
                },
                signupButtonText: {
                    en: properties['ui.signup-button.text.en'] || 'Create account',
                    ar: properties['ui.signup-button.text.ar'] || 'إنشاء حساب'
                },
                loginRequiredMessage: {
                    en: properties['ui.login-required.message.en'] || 'Please sign in to access this content',
                    ar: properties['ui.login-required.message.ar'] || 'يرجى تسجيل الدخول للوصول إلى هذا المحتوى'
                }
            },
            debug: {
                enabled: properties['auth.debug'] === 'true',
                logRedirects: properties['auth.log-redirects'] === 'true',
                logVisibilityChecks: properties['auth.log-visibility-checks'] === 'true'
            }
        };
    }

    private parseVisibilityRules(properties: Record<string, string>): VisibilityRule[] {
        const rules: VisibilityRule[] = [];

        for (const [key, value] of Object.entries(properties)) {
            if (key.startsWith('visibility.folder.')) {
                const path = key.replace('visibility.folder.', '');
                rules.push({
                    path,
                    type: 'folder',
                    rule: value
                });
            } else if (key.startsWith('visibility.file.')) {
                const path = key.replace('visibility.file.', '');
                rules.push({
                    path,
                    type: 'file',
                    rule: value
                });
            }
        }

        return rules;
    }

    private getDefaultConfig(): AuthConfig {
        return {
            environment: 'local',
            version: '1.0.0',
            keycloak: {
                baseUrl: 'http://localhost:8080',
                realm: 'noqodi',
                clientId: 'ums-client',
                protocol: 'openid-connect',
                authEndpoint: '/realms/noqodi/protocol/openid-connect/auth',
                responseType: 'code',
                scope: 'openid'
            },
            redirect: {
                baseUrl: 'http://localhost:4321',
                returnPath: '/auth/callback',
                welcomePath: '/en/welcome'
            },
            auth: {
                enabled: false,
                apiPagesRequireAuth: false,
                sdkPagesRequireAuth: false,
                guidesRequireAuth: false
            },
            session: {
                timeout: 3600,
                refreshThreshold: 300,
                storage: 'localStorage'
            },
            ui: {
                loginButtonText: { en: 'Sign in', ar: 'تسجيل الدخول' },
                signupButtonText: { en: 'Create account', ar: 'إنشاء حساب' },
                loginRequiredMessage: { 
                    en: 'Please sign in to access this content',
                    ar: 'يرجى تسجيل الدخول للوصول إلى هذا المحتوى'
                }
            },
            debug: {
                enabled: false,
                logRedirects: false,
                logVisibilityChecks: false
            }
        };
    }

    async getVisibilityRules(): Promise<VisibilityRule[]> {
        if (this.visibilityRules.length === 0) {
            await this.loadConfig();
        }
        return this.visibilityRules;
    }

    async checkPageVisibility(pagePath: string, userRoles: string[] = []): Promise<{
        visible: boolean;
        requiresAuth: boolean;
        requiredRole?: string;
        rule?: VisibilityRule;
    }> {
        const rules = await this.getVisibilityRules();
        const config = await this.loadConfig();

        if (config.debug.logVisibilityChecks) {
            console.log(`Checking visibility for path: ${pagePath}, user roles:`, userRoles);
        }

        let matchingRule: VisibilityRule | undefined;
        
        for (const rule of rules) {
            if (rule.type === 'file' && pagePath === rule.path) {
                matchingRule = rule;
                break;
            } else if (rule.type === 'folder' && pagePath.startsWith(rule.path)) {
                if (!matchingRule || rule.path.length > matchingRule.path.length) {
                    matchingRule = rule;
                }
            }
        }

        if (!matchingRule) {
            const defaultRule = rules.find(r => r.path === 'visibility.default')?.rule || 'public';
            matchingRule = { path: pagePath, type: 'file', rule: defaultRule };
        }

        const result = {
            visible: true,
            requiresAuth: false,
            requiredRole: undefined as string | undefined,
            rule: matchingRule
        };

        switch (matchingRule.rule) {
            case 'public':
                result.visible = true;
                result.requiresAuth = false;
                break;
            
            case 'authenticated':
                result.visible = userRoles.length > 0;
                result.requiresAuth = true;
                break;
            
            default:
                if (matchingRule.rule.startsWith('role:')) {
                    const requiredRole = matchingRule.rule.substring(5);
                    result.requiredRole = requiredRole;
                    result.visible = userRoles.includes(requiredRole);
                    result.requiresAuth = true;
                } else {
                    result.visible = true;
                    result.requiresAuth = false;
                }
                break;
        }

        if (config.debug.logVisibilityChecks) {
            console.log(`Visibility check result for ${pagePath}:`, result);
        }

        return result;
    }

    generateKeycloakAuthUrl(state?: string, nonce?: string, uiLocale?: string): string {
        if (!this.config) {
            throw new Error('Auth configuration not loaded');
        }

        const { keycloak, redirect } = this.config;
        const redirectUri = encodeURIComponent(`${redirect.baseUrl}${redirect.returnPath}`);
        
        const params = new URLSearchParams({
            response_type: keycloak.responseType,
            scope: keycloak.scope,
            client_id: keycloak.clientId,
            redirect_uri: redirectUri,
            state: state || 'welcome',
            nonce: nonce || Math.random().toString(36).substring(2)
        });

        if (uiLocale) {
            params.set('ui_locales', uiLocale);
        }

        const authUrl = `${keycloak.baseUrl}${keycloak.authEndpoint}?${params.toString()}`;
        
        if (this.config.debug.logRedirects) {
            console.log('Generated Keycloak auth URL:', authUrl);
        }
        
        return authUrl;
    }
}

export const authConfigManager = new AuthConfigManager();
export default authConfigManager;