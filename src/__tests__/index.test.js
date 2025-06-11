describe('AWS Deploy MCP', () => {
  test('package.json should have correct structure', () => {
    const packageJson = require('../../package.json');
    
    expect(packageJson.name).toBe('@cloudagent/aws-deploy');
    expect(packageJson.version).toBe('1.0.2');
    expect(packageJson.bin).toBeDefined();
    expect(packageJson.bin['aws-deploy']).toBe('./bin/amplify-deploy.js');
    expect(packageJson.main).toBe('src/index.js');
    expect(packageJson.license).toBe('MIT');
    expect(packageJson.engines.node).toBe('>=18.0.0');
  });

  test('should have required dependencies', () => {
    const packageJson = require('../../package.json');
    
    // Check core AWS and MCP dependencies
    expect(packageJson.dependencies['@aws-sdk/client-amplify']).toBeDefined();
    expect(packageJson.dependencies['@modelcontextprotocol/sdk']).toBeDefined();
    expect(packageJson.dependencies['@octokit/rest']).toBeDefined();
    
    // Check CLI dependencies
    expect(packageJson.dependencies['commander']).toBeDefined();
    expect(packageJson.dependencies['inquirer']).toBeDefined();
    expect(packageJson.dependencies['chalk']).toBeDefined();
  });

  test('should have development setup', () => {
    const packageJson = require('../../package.json');
    
    expect(packageJson.devDependencies['jest']).toBeDefined();
    expect(packageJson.devDependencies['eslint']).toBeDefined();
    expect(packageJson.devDependencies['typescript']).toBeDefined();
  });

  test('should have required scripts', () => {
    const packageJson = require('../../package.json');
    
    expect(packageJson.scripts['start']).toBeDefined();
    expect(packageJson.scripts['test']).toBeDefined();
    expect(packageJson.scripts['lint']).toBeDefined();
    expect(packageJson.scripts['build']).toBeDefined();
  });
}); 