// Main entry point for the amplify-deploy package
const { MCPServer } = require('./mcp-server');
const { LocalDeploymentService } = require('./local-deployment');
const { ConfigManager } = require('./config-manager');
const { setupWizard } = require('./setup-wizard');

module.exports = {
  MCPServer,
  LocalDeploymentService,
  ConfigManager,
  setupWizard,
  
  // Convenience function to start the server
  async startServer(options = {}) {
    const server = new MCPServer(options);
    await server.start();
    return server;
  },
  
  // Convenience function to deploy
  async deploy(options = {}) {
    const configManager = new ConfigManager();
    const config = await configManager.getConfig();
    
    const DeploymentService = LocalDeploymentService;
    
    const service = new DeploymentService();
    return await service.deploy(options);
  }
};