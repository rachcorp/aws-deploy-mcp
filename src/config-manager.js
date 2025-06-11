const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const keytar = require('keytar');
const { fromIni } = require('@aws-sdk/credential-providers');

class ConfigManager {
  constructor(projectPath = process.cwd()) {
    this.projectPath = projectPath;
    this.configDir = path.join(os.homedir(), '.amplify-deploy');
    this.configFile = path.join(this.configDir, 'config.json');
    this.serviceName = 'amplify-deploy';
  }

  async initialize() {
    // Ensure config directory exists
    try {
      await fs.mkdir(this.configDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Initialize config file if not exists
    try {
      await fs.access(this.configFile);
    } catch {
      await this.saveConfig({
        version: '1.0.0',
        mode: 'local',
        aws: {
          region: 'us-east-1',
          profile: 'default'
        }
      });
    }
  }

  async getConfig() {
    try {
      const data = await fs.readFile(this.configFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async saveConfig(config) {
    await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
  }

  async getAWSConfig() {
    // First check if we have environment variables (MCP mode)
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      return {
        region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          sessionToken: process.env.AWS_SESSION_TOKEN
        }
      };
    }

    // Fall back to AWS profile-based credentials
    const config = await this.getConfig();
    
    if (!config || !config.aws) {
      return {
        region: 'us-east-1',
        credentials: fromIni({ profile: 'default' })
      };
    }

    return {
      region: config.aws.region || 'us-east-1',
      credentials: fromIni({ profile: config.aws.profile || 'default' })
    };
  }

  async saveAWSConfig(awsConfig) {
    const config = await this.getConfig() || {};
    config.aws = awsConfig;
    await this.saveConfig(config);
  }

  async getGitHubToken() {
    try {
      // Try to get from secure storage first
      const token = await keytar.getPassword(this.serviceName, 'github-token');
      if (token) return token;

      // Fallback to config file (less secure)
      const config = await this.getConfig();
      return config?.github?.token;
    } catch {
      return null;
    }
  }

  async saveGitHubToken(token) {
    try {
      // Save to secure storage
      await keytar.setPassword(this.serviceName, 'github-token', token);
    } catch {
      // Fallback to config file if keytar fails
      const config = await this.getConfig() || {};
      config.github = { token };
      await this.saveConfig(config);
    }
  }

  async getSaaSConfig() {
    const config = await this.getConfig();
    return config?.saas || null;
  }

  async saveSaaSConfig(saasConfig) {
    const config = await this.getConfig() || {};
    config.saas = saasConfig;
    await this.saveConfig(config);
  }

  async getProjectConfig() {
    const configPath = path.join(this.projectPath, '.amplify-deploy.json');
    
    try {
      const data = await fs.readFile(configPath, 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async saveProjectConfig(projectConfig) {
    const configPath = path.join(this.projectPath, '.amplify-deploy.json');
    await fs.writeFile(configPath, JSON.stringify(projectConfig, null, 2));
    
    // Add to .gitignore if not already there
    const gitignorePath = path.join(this.projectPath, '.gitignore');
    try {
      const gitignore = await fs.readFile(gitignorePath, 'utf8');
      if (!gitignore.includes('.amplify-deploy.json')) {
        await fs.appendFile(gitignorePath, '\n# Amplify Deploy\n.amplify-deploy.json\n');
      }
    } catch {
      // No .gitignore, create one
      await fs.writeFile(gitignorePath, '# Amplify Deploy\n.amplify-deploy.json\n');
    }
  }

  async getDeploymentHistory() {
    const config = await this.getConfig();
    return config?.deployments || [];
  }

  async addDeployment(deployment) {
    const config = await this.getConfig() || {};
    config.deployments = config.deployments || [];
    config.deployments.unshift({
      ...deployment,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 10 deployments
    config.deployments = config.deployments.slice(0, 10);
    
    await this.saveConfig(config);
  }
}

module.exports = { ConfigManager };