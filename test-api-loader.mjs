// Test the dynamic API loader
import { loadAllApiSpecs, getApiSpecsForHeader } from './src/utils/dynamic-openapi.ts';

async function testApiLoader() {
    console.log('Testing Dynamic API Loader...\n');
    
    try {
        // Test English specs
        console.log('🔍 Loading English API specs...');
        const enSpecs = await loadAllApiSpecs('en');
        console.log(`✅ Found ${enSpecs.length} English specs:`);
        enSpecs.forEach(spec => {
            console.log(`  - ${spec.title} (${spec.operations.length} operations)`);
        });
        
        // Test Arabic specs
        console.log('\n🔍 Loading Arabic API specs...');
        const arSpecs = await loadAllApiSpecs('ar');
        console.log(`✅ Found ${arSpecs.length} Arabic specs:`);
        arSpecs.forEach(spec => {
            console.log(`  - ${spec.title} (${spec.operations.length} operations)`);
        });
        
        // Test header format
        console.log('\n🔍 Testing header format...');
        const headerSpecs = await getApiSpecsForHeader('en');
        console.log(`✅ Header format specs: ${headerSpecs.length}`);
        headerSpecs.forEach(spec => {
            console.log(`  - ${spec.serviceName}: ${spec.operations.length} operations`);
        });
        
        console.log('\n🎉 All tests passed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testApiLoader();