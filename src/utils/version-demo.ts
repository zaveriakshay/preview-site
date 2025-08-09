// Demo script to show version detection functionality
// This can be removed after testing

import { getAvailableVersions, parseCurrentPath, generateVersionPath } from './versions.ts';

// Example usage and testing
export async function demoVersionDetection() {
    console.log('=== Version Detection Demo ===\n');

    // Test path parsing
    const testPaths = [
        '/en/guides/mobile/v2/registration/individual',
        '/ar/guides/web/v1/fundings/cash-withdrawal',
        '/en/guides/mobile/v3/send-money/wallet',
        '/ar/guides/web/v2/'
    ];

    for (const path of testPaths) {
        console.log(`Path: ${path}`);
        const parsed = parseCurrentPath(path);
        console.log(`  Language: ${parsed.language}`);
        console.log(`  Guide Type: ${parsed.guideType}`);
        console.log(`  Version: ${parsed.version}`);
        console.log(`  Full Path: ${parsed.fullPath}\n`);
    }

    // Test version detection for different contexts
    console.log('=== Available Versions by Context ===\n');

    const contexts = [
        { language: 'en', guideType: 'mobile' },
        { language: 'ar', guideType: 'mobile' },
        { language: 'en', guideType: 'web' },
        { language: 'ar', guideType: 'web' }
    ];

    for (const context of contexts) {
        try {
            const versions = await getAvailableVersions(context.language, context.guideType);
            console.log(`${context.language.toUpperCase()} ${context.guideType}:`);
            versions.forEach(v => {
                console.log(`  ${v.version} - ${v.label}${v.badge ? ` (${v.badge})` : ''}`);
            });
            console.log('');
        } catch (error) {
            console.log(`Error for ${context.language} ${context.guideType}:`, error);
        }
    }

    // Test path generation
    console.log('=== Path Generation Test ===\n');
    const originalPath = '/en/guides/mobile/v2/registration/individual';
    console.log(`Original: ${originalPath}`);
    console.log(`Switch to v1: ${generateVersionPath(originalPath, 'v1')}`);
    console.log(`Switch to v3: ${generateVersionPath(originalPath, 'v3')}`);
}

// Uncomment to run demo
// demoVersionDetection().catch(console.error);