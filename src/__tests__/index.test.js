const { MCPServer, LocalDeploymentService, ConfigManager, setupWizard } = require('../index');

describe('Amplify Deploy MCP', () => {
  test('should export main modules', () => {
    expect(MCPServer).toBeDefined();
    expect(LocalDeploymentService).toBeDefined();
    expect(ConfigManager).toBeDefined();
    expect(setupWizard).toBeDefined();
  });

  test('should have startServer function', () => {
    const { startServer } = require('../index');
    expect(typeof startServer).toBe('function');
  });

  test('should have deploy function', () => {
    const { deploy } = require('../index');
    expect(typeof deploy).toBe('function');
  });
}); 