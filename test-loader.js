// Simple test of the dynamic API loader
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

async function testLoader() {
    console.log('🔍 Testing API Spec Loader...\n');
    
    const language = 'en';
    const apiSpecsPath = join(process.cwd(), 'src', 'content', 'docs', language, 'apispecs');
    
    console.log(`📁 Looking in: ${apiSpecsPath}`);
    
    try {
        const files = await readdir(apiSpecsPath);
        console.log(`📋 Found files:`, files);
        
        const yamlFiles = files.filter(file => 
            file.endsWith('.yaml') || file.endsWith('.yml')
        );
        
        console.log(`📝 YAML files:`, yamlFiles);
        
        for (const fileName of yamlFiles) {
            console.log(`\n🔧 Processing: ${fileName}`);
            
            const filePath = join(apiSpecsPath, fileName);
            const fileContent = await readFile(filePath, 'utf-8');
            
            try {
                const spec = parse(fileContent);
                console.log(`  ✅ Title: ${spec.info?.title || 'No title'}`);
                console.log(`  ✅ Version: ${spec.info?.version || 'No version'}`);
                console.log(`  ✅ Paths: ${Object.keys(spec.paths || {}).length} endpoints`);
            } catch (parseError) {
                console.log(`  ❌ Parse error:`, parseError.message);
            }
        }
        
    } catch (error) {
        console.error(`❌ Error:`, error.message);
    }
}

testLoader().catch(console.error);