const { AmplifyClient, CreateAppCommand, CreateBranchCommand, StartJobCommand, GetAppCommand, GetBranchCommand, ListAppsCommand, ListBranchesCommand } = require('@aws-sdk/client-amplify');
const { Octokit } = require('@octokit/rest');
const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const open = require('open');
const ora = require('ora');
const chalk = require('chalk');
const { ConfigManager } = require('./config-manager');
const yaml = require('yaml');
const fetch = require('node-fetch');

class LocalDeploymentService {
  constructor() {
    this.configManager = new ConfigManager();
    this.amplifyClient = null;
    this.octokit = null;
  }

  async initialize() {
    try {
      // Initialize AWS Amplify client
      const awsConfig = await this.configManager.getAWSConfig();
      this.amplifyClient = new AmplifyClient({
        region: awsConfig.region || 'us-east-1',
        credentials: awsConfig.credentials
      });

      // Initialize GitHub client
      const githubToken = await this.configManager.getGitHubToken();
      if (githubToken) {
        this.octokit = new Octokit({ auth: githubToken });
      }
    } catch (error) {
      // Don't fail initialization if credentials are invalid
      // This allows the MCP server to still function for config generation
      console.error('Warning: AWS initialization failed:', error.message);
    }
  }

  async deploy(options) {
    const spinner = ora('Starting deployment...').start();
    
    try {
      await this.initialize();
      
      // Step 1: Validate project
      spinner.text = 'Validating project...';
      await this.validateProject(options.projectPath);
      
      // Step 2: Ensure amplify.yml exists
      spinner.text = 'Checking amplify.yml...';
      await this.ensureAmplifyConfig(options.projectPath);
      
      // Step 3: Ensure GitHub repo exists and is pushed
      spinner.text = 'Setting up GitHub repository...';
      const repoInfo = await this.ensureGitHubRepo(options.projectPath);
      
      // Step 4: Get GitHub token (interactive if needed)
      spinner.text = 'Authenticating with GitHub...';
      const githubToken = await this.ensureGitHubAuth();
      
      // Step 5: Test GitHub token specifically against target repository
      spinner.text = 'Validating repository access...';
      await this.validateGitHubTokenForRepository(githubToken, repoInfo);
      
      // Step 6: Create Amplify app
      spinner.text = 'Creating Amplify app...';
      const appInfo = await this.createAmplifyApp({
        name: options.appName || path.basename(options.projectPath),
        repository: repoInfo.repository,
        accessToken: githubToken,
        branch: options.branch,
        region: options.region
      });
      
      // Step 7: Wait for deployment
      spinner.text = 'Deploying application...';
      const deploymentUrl = await this.waitForDeployment(appInfo.appId, options.branch);
      
      spinner.succeed('Deployment completed successfully!');
      
      return {
        appId: appInfo.appId,
        url: deploymentUrl,
        region: options.region
      };
      
    } catch (error) {
      spinner.fail('Deployment failed');
      throw error;
    }
  }

  // MCP-friendly deployment method without spinner
  async deployForMCP(options) {
    try {
      await this.initialize();
      
      // Step 1: Validate project
      await this.validateProject(options.projectPath);
      
      // Step 2: Ensure amplify.yml exists
      await this.ensureAmplifyConfig(options.projectPath);
      
      // Step 3: Ensure GitHub repo exists and is pushed
      const repoInfo = await this.ensureGitHubRepo(options.projectPath);
      
      // Step 4: Get GitHub token (interactive if needed)
      const githubToken = await this.ensureGitHubAuth();
      
      // Step 5: Test GitHub token specifically against target repository
      await this.validateGitHubTokenForRepository(githubToken, repoInfo);
      
      // Step 6: Create Amplify app
      const appInfo = await this.createAmplifyApp({
        name: options.appName || path.basename(options.projectPath),
        repository: repoInfo.repository,
        accessToken: githubToken,
        branch: options.branch,
        region: options.region
      });
      
      // Save deployment to history immediately after app creation
      await this.configManager.addDeployment({
        appId: appInfo.appId,
        appName: options.appName || path.basename(options.projectPath),
        projectPath: options.projectPath,
        repository: repoInfo.repository,
        branch: options.branch,
        region: options.region,
        status: 'CREATED',
        url: null // Will be updated when deployment completes
      });
      
      // Step 7: Wait for deployment
      let deploymentUrl;
      let finalStatus = 'IN_PROGRESS';
      
      try {
        deploymentUrl = await this.waitForDeployment(appInfo.appId, options.branch);
        finalStatus = 'DEPLOYED';
        
        // Update deployment history with final URL and status
        await this.configManager.addDeployment({
          appId: appInfo.appId,
          appName: options.appName || path.basename(options.projectPath),
          projectPath: options.projectPath,
          repository: repoInfo.repository,
          branch: options.branch,
          region: options.region,
          status: 'DEPLOYED',
          url: deploymentUrl
        });
        
      } catch (waitError) {
        // Even if waiting fails, the app was created successfully
        if (waitError.message.includes('PARTIAL_SUCCESS:') || waitError.message.includes('TIMEOUT:')) {
          // Extract app ID and tentative URL from error message for partial success
          const tentativeUrl = `https://${options.branch}.${appInfo.appId}.amplifyapp.com`;
          
          // Update deployment history with partial success
          await this.configManager.addDeployment({
            appId: appInfo.appId,
            appName: options.appName || path.basename(options.projectPath),
            projectPath: options.projectPath,
            repository: repoInfo.repository,
            branch: options.branch,
            region: options.region,
            status: 'DEPLOYING',
            url: tentativeUrl
          });
        }
        
        // Re-throw the error to be handled by the MCP server
        throw waitError;
      }
      
      return {
        appId: appInfo.appId,
        url: deploymentUrl,
        region: options.region
      };
      
    } catch (error) {
      // Re-throw with enhanced error information for MCP context
      throw new Error(`Deployment failed: ${error.message}`);
    }
  }

  // New method: Background deployment that returns immediately after app creation
  async deployForMCPBackground(options) {
    try {
      await this.initialize();
      
      // Step 1: Validate project
      await this.validateProject(options.projectPath);
      
      // Step 2: Ensure amplify.yml exists
      await this.ensureAmplifyConfig(options.projectPath);
      
      // Step 3: Ensure GitHub repo exists and is pushed
      const repoInfo = await this.ensureGitHubRepo(options.projectPath);
      
      // Step 4: Get GitHub token (interactive if needed)
      const githubToken = await this.ensureGitHubAuth();
      
      // Step 5: Test GitHub token specifically against target repository
      await this.validateGitHubTokenForRepository(githubToken, repoInfo);
      
      // Step 6: Create Amplify app
      const appInfo = await this.createAmplifyApp({
        name: options.appName || path.basename(options.projectPath),
        repository: repoInfo.repository,
        accessToken: githubToken,
        branch: options.branch,
        region: options.region
      });
      
      // Save deployment to history immediately after app creation
      await this.configManager.addDeployment({
        appId: appInfo.appId,
        appName: options.appName || path.basename(options.projectPath),
        projectPath: options.projectPath,
        repository: repoInfo.repository,
        branch: options.branch,
        region: options.region,
        status: 'PROVISIONING',
        url: null // Will be updated when deployment completes
      });
      
      // Generate expected URL
      const expectedUrl = `https://${options.branch || 'main'}.${appInfo.appId}.amplifyapp.com`;
      
      // Return immediately after app creation - deployment continues in background
      return {
        appId: appInfo.appId,
        url: expectedUrl,
        region: options.region,
        status: 'PROVISIONING',
        isBackground: true
      };
      
    } catch (error) {
      // Re-throw with enhanced error information for MCP context
      throw new Error(`Deployment failed: ${error.message}`);
    }
  }

  async validateProject(projectPath) {
    // First, detect the project type
    const framework = await this.detectFramework(projectPath);
    
    // For non-static projects, require package.json
    if (framework !== 'static') {
      const packageJsonPath = path.join(projectPath, 'package.json');
      try {
        await fs.access(packageJsonPath);
      } catch {
        throw new Error('No package.json found. Please run this command from your project root.');
      }
    } else {
      // For static sites, check if there are any HTML files
      try {
        const files = await fs.readdir(projectPath);
        
        // More flexible HTML file detection
        const hasHtmlFiles = files.some(file => {
          const lowerFile = file.toLowerCase();
          return lowerFile.endsWith('.html') || 
                 lowerFile.endsWith('.htm') || 
                 lowerFile === 'index.html' ||
                 lowerFile === 'index.htm';
        });
        
        if (!hasHtmlFiles) {
          // Check subdirectories for common static site structures
          const subdirs = ['public', 'dist', 'build', 'docs'];
          let foundInSubdir = false;
          
          for (const subdir of subdirs) {
            try {
              const subdirPath = path.join(projectPath, subdir);
              await fs.access(subdirPath);
              const subdirFiles = await fs.readdir(subdirPath);
              if (subdirFiles.some(file => file.toLowerCase().endsWith('.html') || file.toLowerCase().endsWith('.htm'))) {
                foundInSubdir = true;
                break;
              }
            } catch {
              // Subdirectory doesn't exist, continue
            }
          }
          
          if (!foundInSubdir) {
            throw new Error(`No HTML files found in ${projectPath}. Found files: ${files.join(', ')}. For static sites, please ensure you have at least one .html file in the root directory or in common subdirectories (public, dist, build, docs).`);
          }
        }
      } catch (error) {
        if (error.message.includes('No HTML files found')) {
          throw error;
        }
        throw new Error(`Cannot read project directory ${projectPath}. Please check your path. Error: ${error.message}`);
      }
    }

    // Check if git is initialized
    try {
      execSync('git status', { cwd: projectPath, stdio: 'pipe' });
    } catch {
      throw new Error('Git is not initialized. Run "git init" first.');
    }
  }

  async ensureAmplifyConfig(projectPath) {
    const configPath = path.join(projectPath, 'amplify.yml');
    
    try {
      await fs.access(configPath);
      return;
    } catch {
      // Generate default config
      const framework = await this.detectFramework(projectPath);
      const config = await this.generateAmplifyConfig(framework, projectPath, true);
    }
  }

  async detectFramework(projectPath) {
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    try {
      // Check if package.json exists
      await fs.access(packageJsonPath);
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      if (dependencies['next']) return 'nextjs';
      if (dependencies['react']) return 'react';
      if (dependencies['vue']) return 'vue';
      if (dependencies['@angular/core']) return 'angular';
      
      // Check if this is a Node.js CLI tool or server project (not suitable for static hosting)
      const isCliTool = packageJson.bin || 
                       dependencies['commander'] || 
                       dependencies['inquirer'] ||
                       dependencies['@modelcontextprotocol/sdk'] ||
                       packageJson.name?.includes('cli') ||
                       packageJson.description?.toLowerCase().includes('cli');
      
      const isServerProject = dependencies['express'] || 
                             dependencies['fastify'] ||
                             dependencies['koa'] ||
                             dependencies['hapi'];
      
      if (isCliTool || isServerProject) {
        throw new Error(`This appears to be a ${isCliTool ? 'CLI tool' : 'server'} project, not a web application. Amplify is for hosting static sites and web applications. Please run this command from your web project directory.`);
      }
      
      return 'static';
    } catch (error) {
      if (error.message.includes('CLI tool') || error.message.includes('server project')) {
        throw error;
      }
      // No package.json found or invalid JSON - assume static site
      return 'static';
    }
  }

  async generateAmplifyConfig(framework, projectPath, writeToFile = false) {
    const configs = {
      nextjs: {
        version: 1,
        frontend: {
          phases: {
            preBuild: {
              commands: ['npm ci']
            },
            build: {
              commands: ['npm run build']
            }
          },
          artifacts: {
            baseDirectory: '.next',
            files: ['**/*']
          },
          cache: {
            paths: ['node_modules/**/*']
          }
        }
      },
      react: {
        version: 1,
        frontend: {
          phases: {
            preBuild: {
              commands: ['npm ci']
            },
            build: {
              commands: ['npm run build']
            }
          },
          artifacts: {
            baseDirectory: 'build',
            files: ['**/*']
          },
          cache: {
            paths: ['node_modules/**/*']
          }
        }
      },
      vue: {
        version: 1,
        frontend: {
          phases: {
            preBuild: {
              commands: ['npm ci']
            },
            build: {
              commands: ['npm run build']
            }
          },
          artifacts: {
            baseDirectory: 'dist',
            files: ['**/*']
          },
          cache: {
            paths: ['node_modules/**/*']
          }
        }
      },
      static: {
        version: 1,
        frontend: {
          phases: {
            build: {
              commands: ['echo "No build required"']
            }
          },
          artifacts: {
            baseDirectory: '.',
            files: ['**/*']
          }
        }
      }
    };

    const config = configs[framework] || configs.static;
    
    // Only save to file if explicitly requested
    if (writeToFile && projectPath) {
      const configPath = path.join(projectPath, 'amplify.yml');
      await fs.writeFile(configPath, yaml.stringify(config));
    }
    
    return yaml.stringify(config);
  }

  async ensureGitHubRepo(projectPath) {
    // Check if remote exists
    try {
      const remoteUrl = execSync('git config --get remote.origin.url', {
        cwd: projectPath,
        encoding: 'utf8'
      }).trim();
      
      // Extract owner and repo from URL
      const match = remoteUrl.match(/github\.com[:/](.+)\/(.+?)(\.git)?$/);
      if (match) {
        return {
          repository: `https://github.com/${match[1]}/${match[2]}`,
          owner: match[1],
          repo: match[2]
        };
      }
    } catch {
      // No remote, need to create
      throw new Error('No GitHub remote found. Please add your GitHub repository as origin.');
    }
  }

  async ensureGitHubAuth() {
    let token = await this.configManager.getGitHubToken();
    
    // Also check environment variable for GitHub token
    if (!token && process.env.GITHUB_TOKEN) {
      token = process.env.GITHUB_TOKEN;
      // Save it for future use
      await this.configManager.saveGitHubToken(token);
    }
    
    if (!token) {
      throw new Error(`🔗 AWS Amplify GitHub App Setup Required

AWS Amplify now requires a 2-step setup process:

🌍 FIRST: Which AWS region will you deploy to?
   - US East (N. Virginia): us-east-1 (recommended default)
   - US West (Oregon): us-west-2  
   - EU (Ireland): eu-west-1
   - EU (Frankfurt): eu-central-1
   - Asia Pacific (Sydney): ap-southeast-2
   - Asia Pacific (Tokyo): ap-northeast-1
   - Other regions: Check AWS Amplify documentation
   
   💡 Use us-east-1 if unsure (most common choice)

📱 STEP 1: Install AWS Amplify GitHub App for your region (REQUIRED FIRST!)
   Region-specific installation URLs:
   - US East 1: https://github.com/apps/aws-amplify-us-east-1/installations/new
   - US West 2: https://github.com/apps/aws-amplify-us-west-2/installations/new
   - EU West 1: https://github.com/apps/aws-amplify-eu-west-1/installations/new
   - EU Central 1: https://github.com/apps/aws-amplify-eu-central-1/installations/new
   - AP Southeast 2: https://github.com/apps/aws-amplify-ap-southeast-2/installations/new
   - AP Northeast 1: https://github.com/apps/aws-amplify-ap-northeast-1/installations/new
   
   Instructions:
   - Select your GitHub account/organization
   - Choose "All repositories" OR select specific repositories
   - Click "Install" 
   
   ⚠️  Without this GitHub App, deployment will fail!

🔑 STEP 2: Create Personal Access Token
   - Go to: https://github.com/settings/tokens/new
   - Description: "AWS Amplify Deploy Access"
   - IMPORTANT: Select "admin:repo_hook" scope (not "repo")
   - Generate and copy the token

⚙️  STEP 3: Configure Token
   Add to your MCP configuration (~/.cursor/mcp.json):
   "env": {
     "AWS_ACCESS_KEY_ID": "your-access-key",
     "AWS_SECRET_ACCESS_KEY": "your-secret-key", 
     "GITHUB_TOKEN": "your-github-token",
     "AWS_REGION": "your-chosen-region"
   }

🔄 STEP 4: Restart Cursor

💡 Quick guided setup: Run "amplify-deploy setup"

Alternative: export GITHUB_TOKEN="your-github-token"`);
    }
    
    // Validate the token by testing it against GitHub API
    await this.validateGitHubToken(token);
    
    return token;
  }

  async validateGitHubToken(token) {
    try {
      // Check token type first - this will throw if incompatible
      this.checkGitHubTokenType(token);
      
      // 1. Basic token validation with enhanced error reporting
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'User-Agent': 'amplify-deploy'
        }
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          // Get more details about the error
          const errorText = await response.text();
          throw new Error(`GitHub token is invalid or expired (HTTP ${response.status}).
          
Response details: ${errorText}

Please create a new token for AWS Amplify GitHub App:
1. Install AWS Amplify GitHub App: https://github.com/apps/aws-amplify-us-east-1/installations/new
2. Go to: https://github.com/settings/tokens/new
3. Select "admin:repo_hook" scope (for GitHub App webhook management)
4. Update your MCP configuration with the new token
5. Restart Cursor

Current token info:
- Length: ${token.length} characters
- Prefix: ${token.substring(0, 4)}...
- Suffix: ...${token.substring(token.length - 4)}`);
        }
        
        const errorText = await response.text();
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}. Response: ${errorText}`);
      }
      
      const user = await response.json();
      
      // 2. Check repo scope permissions
      const reposResponse = await fetch('https://api.github.com/user/repos?per_page=1', {
        headers: {
          'Authorization': `token ${token}`,
          'User-Agent': 'amplify-deploy'
        }
      });
      
      if (!reposResponse.ok) {
        const errorText = await reposResponse.text();
        throw new Error(`GitHub token validation failed for AWS Amplify GitHub App (HTTP ${reposResponse.status}).
        
Response details: ${errorText}

Please create a new token for AWS Amplify GitHub App:
1. Install AWS Amplify GitHub App: https://github.com/apps/aws-amplify-us-east-1/installations/new
2. Go to: https://github.com/settings/tokens/new
3. Select "admin:repo_hook" scope (for GitHub App webhook management)
4. Update your MCP configuration
5. Restart Cursor`);
      }
      
      // 3. Check token scopes in response headers
      const scopes = reposResponse.headers.get('X-OAuth-Scopes');
      if (scopes) {
        if (!scopes.includes('admin:repo_hook')) {
          throw new Error(`GitHub token missing required scope for AWS Amplify GitHub App.

Current scopes: ${scopes}
Required scope: admin:repo_hook

AWS Amplify GitHub App requires 'admin:repo_hook' scope for:
- Repository webhook management
- Deployment automation
- GitHub App integration

🔧 To fix this:
1. Install AWS Amplify GitHub App for your region first
2. Create a new token: https://github.com/settings/tokens/new
3. Select "admin:repo_hook" scope (not "repo")
4. Update your MCP configuration
5. Restart Cursor

📋 Current token info:
- User: ${user.login}
- Available scopes: ${scopes}
- Missing: admin:repo_hook`);
        }
      }
      
    } catch (error) {
      if (error.message.includes('GitHub token') || error.message.includes('GitHub API')) {
        throw error;
      }
      throw new Error(`Failed to validate GitHub token: ${error.message}. Please check your internet connection and token.

Token details for debugging:
- Token length: ${token.length}
- Token format: ${token.startsWith('ghp_') ? 'Classic (good)' : token.startsWith('github_pat_') ? 'Fine-grained (may not work with Amplify)' : 'Unknown format'}
- Error type: ${error.name}
- Network error: ${error.code || 'N/A'}`);
    }
  }

  // Helper method to check GitHub token type
  checkGitHubTokenType(token) {
    if (token.startsWith('github_pat_')) {
      throw new Error(`Fine-grained GitHub token detected. AWS Amplify GitHub App requires CLASSIC tokens.

Current token: Fine-grained (starts with 'github_pat_')
Required: Classic token (starts with 'ghp_')

🔧 To fix this:
1. Go to: https://github.com/settings/tokens/new
2. Select "Tokens (classic)" - NOT "Fine-grained personal access tokens"
3. Select "admin:repo_hook" scope
4. Generate token and update your configuration`);
    } else if (token.startsWith('ghp_')) {
      // Classic GitHub token detected - compatible with AWS Amplify GitHub App
      return;
    } else {
      throw new Error(`Unknown GitHub token format. AWS Amplify requires classic tokens.

Current token format: Unknown (starts with '${token.substring(0, 4)}...')
Required: Classic token (starts with 'ghp_')

🔧 Create a classic token:
1. Go to: https://github.com/settings/tokens/new
2. Select "Tokens (classic)"
3. Select "admin:repo_hook" scope
4. Generate and use the new token`);
    }
  }

  // New method to test token specifically against target repository
  async validateGitHubTokenForRepository(token, repoInfo) {
    try {
      // Test repository access
      const repoResponse = await fetch(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`, {
        headers: {
          'Authorization': `token ${token}`,
          'User-Agent': 'amplify-deploy'
        }
      });
      
      if (!repoResponse.ok) {
        if (repoResponse.status === 404) {
          throw new Error(`GitHub token cannot access repository ${repoInfo.repository}. This could mean:
1. Repository doesn't exist
2. Repository is private and token lacks access
3. Token doesn't have sufficient permissions

For AWS Amplify GitHub App, ensure your token has 'admin:repo_hook' scope and the GitHub App is installed.`);
        }
        throw new Error(`Cannot access repository ${repoInfo.repository}: ${repoResponse.status} ${repoResponse.statusText}`);
      }
      
      const repo = await repoResponse.json();
      
      // Test webhook permissions (required by AWS Amplify)
      const hooksResponse = await fetch(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/hooks`, {
        headers: {
          'Authorization': `token ${token}`,
          'User-Agent': 'amplify-deploy'
        }
      });
      
      if (!hooksResponse.ok && hooksResponse.status !== 403) {
        // Note: Cannot test webhook permissions: ${hooksResponse.status}
      } else if (hooksResponse.status === 403) {
        throw new Error(`GitHub token lacks webhook permissions for ${repoInfo.repository}.

AWS Amplify GitHub App requires 'admin:repo_hook' scope for webhook management. Please ensure:
1. AWS Amplify GitHub App is installed for your account/organization
2. Token has 'admin:repo_hook' scope (not 'repo')
3. You have admin access to the repository
4. Token is a classic token (starts with 'ghp_')

🔧 Setup steps:
1. Install GitHub App: https://github.com/apps/aws-amplify-us-east-1/installations/new
2. Create classic token: https://github.com/settings/tokens/new
3. Select 'admin:repo_hook' scope`);
      } else {
        // Webhook permissions confirmed
      }
      
    } catch (error) {
      if (error.message.includes('GitHub token') || error.message.includes('Repository') || error.message.includes('webhook')) {
        throw error;
      }
      throw new Error(`Failed to validate repository access: ${error.message}`);
    }
  }

  async startOAuthFlow() {
    // Not used in MCP context - kept for CLI compatibility
    return 'https://github.com/settings/tokens/new?scopes=repo&description=Amplify+Deploy+Access';
  }

  async waitForOAuthCallback() {
    // Not used in MCP context - kept for CLI compatibility  
    throw new Error('OAuth callback not implemented for MCP server context');
  }

  async createAmplifyApp(options) {
    try {
      // Removed debug console statements to prevent MCP JSON parsing errors
      
      // Create the app
      const createAppResponse = await this.amplifyClient.send(new CreateAppCommand({
        name: options.name,
        repository: options.repository,
        oauthToken: options.accessToken,
        enableBranchAutoBuild: true,
        enableBranchAutoDeletion: false,
        environmentVariables: {}
      }));

      const appId = createAppResponse.app.appId;
      // Removed console.log to prevent MCP JSON parsing errors

      // Create branch
      await this.amplifyClient.send(new CreateBranchCommand({
        appId: appId,
        branchName: options.branch,
        enableAutoBuild: true,
        enablePullRequestPreview: true
      }));

      // Removed console.log to prevent MCP JSON parsing errors

      // Start initial deployment
      await this.amplifyClient.send(new StartJobCommand({
        appId: appId,
        branchName: options.branch,
        jobType: 'RELEASE'
      }));

      // Removed console.log to prevent MCP JSON parsing errors

      return {
        appId: appId,
        appArn: createAppResponse.app.appArn
      };

    } catch (error) {
      // Removed console.error to prevent MCP JSON parsing errors
      
      if (error.name === 'LimitExceededException') {
        throw new Error('AWS Amplify app limit reached. Please delete unused apps.');
      }
      
      // Handle GitHub-related errors specifically
      if (error.message && (error.message.includes('Bad credentials') || error.message.includes('authentication'))) {
        throw new Error(`GitHub authentication failed during AWS Amplify setup.

Your GitHub token passed validation but AWS Amplify rejected it. This usually means:

1. **GitHub App Not Installed**: AWS Amplify GitHub App must be installed first
   - Install for your region: https://github.com/apps/aws-amplify-${options.region || 'us-east-1'}/installations/new
   - Select repositories you want to deploy

2. **Wrong Token Scope**: AWS Amplify GitHub App requires 'admin:repo_hook' scope
   - Current token starts with: ${options.accessToken?.substring(0, 4)}...
   - Required scope: 'admin:repo_hook' (not 'repo')
   - Token must be classic (starts with 'ghp_')

3. **Repository Access Issues**: 
   - Repository must be included in GitHub App installation
   - If organization repo: Enable SSO if required
   - Ensure token has access to the specific repository

🔧 Solutions:
1. Install AWS Amplify GitHub App for your region
2. Create a new CLASSIC token: https://github.com/settings/tokens/new
3. Select 'admin:repo_hook' scope
4. Update your MCP configuration and restart Cursor

AWS Error: ${error.message}`);
      }
      
      if (error.message && error.message.includes('repository')) {
        throw new Error(`Repository setup failed during AWS Amplify setup:

1. Repository URL: ${options.repository}
2. Verify repository exists and is accessible
3. Check repository permissions
4. Ensure repository is not archived

AWS Error: ${error.message}`);
      }
      
      // Generic AWS Amplify error with more details
      throw new Error(`AWS Amplify deployment failed: ${error.message}

Debug Information:
- Error Type: ${error.name}
- Error Code: ${error.code || 'N/A'}
- HTTP Status: ${error.$metadata?.httpStatusCode || 'N/A'}
- Request ID: ${error.$metadata?.requestId || 'N/A'}

Please check the AWS Amplify console for more details.`);
    }
  }

  async waitForDeployment(appId, branchName) {
    const maxAttempts = 120; // 10 minutes (120 * 5 seconds)
    let attempts = 0;

    while (attempts < maxAttempts) {
      const branchResponse = await this.amplifyClient.send(new GetBranchCommand({
        appId: appId,
        branchName: branchName
      }));

      const stage = branchResponse.branch.stage;

      if (stage === 'PRODUCTION') {
        // Get the app URL
        const appResponse = await this.amplifyClient.send(new GetAppCommand({
          appId: appId
        }));

        return `https://${branchName}.${appResponse.app.defaultDomain}`;
      }

      if (stage === 'FAILED') {
        throw new Error('Deployment failed. Check AWS Amplify console for details.');
      }

      // For MCP context, don't wait indefinitely - return partial success for long deployments
      if (attempts >= 36) { // After 3 minutes, consider returning partial success
        const appResponse = await this.amplifyClient.send(new GetAppCommand({
          appId: appId
        }));
        
        // Return a partial success response indicating deployment is in progress
        const tentativeUrl = `https://${branchName}.${appResponse.app.defaultDomain}`;
        throw new Error(`PARTIAL_SUCCESS: App created successfully but deployment is still in progress.

🎉 Your Amplify app has been created!
📱 App ID: ${appId}
🌐 Expected URL: ${tentativeUrl}
⏳ Current Status: ${stage}

The deployment is continuing in the background. You can:
1. Monitor progress in AWS Amplify Console
2. Check status using: check_deployment_status(app_id="${appId}")
3. Visit the URL in a few minutes when deployment completes

Note: Initial deployments can take 5-15 minutes.`);
      }

      // Wait 5 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    }

    // Final timeout - still provide helpful information
    const appResponse = await this.amplifyClient.send(new GetAppCommand({
      appId: appId
    }));
    const tentativeUrl = `https://${branchName}.${appResponse.app.defaultDomain}`;
    
    throw new Error(`TIMEOUT: Deployment is taking longer than expected but may still succeed.

🎉 Your Amplify app was created successfully!
📱 App ID: ${appId}
🌐 Expected URL: ${tentativeUrl}
⏳ Status: Deployment in progress

The app may become available soon. Check:
1. AWS Amplify Console for current status
2. Try the URL in a few minutes: ${tentativeUrl}
3. Use check_deployment_status(app_id="${appId}") to monitor progress`);
  }

  async getStatus(appId) {
    await this.initialize();
    
    try {
      // Get app details
      const appResponse = await this.amplifyClient.send(new GetAppCommand({
        appId: appId
      }));

      const app = appResponse.app;
      
      // Try to find the active branch - don't assume 'main'
      const branchesResponse = await this.amplifyClient.send(new ListBranchesCommand({
        appId: appId
      }));
      
      if (!branchesResponse.branches || branchesResponse.branches.length === 0) {
        return {
          appName: app.name,
          status: 'NO_BRANCHES',
          branch: 'None',
          lastUpdated: app.updateTime,
          url: null
        };
      }
      
      // Find the production branch or use the first one
      let targetBranch = branchesResponse.branches.find(b => 
        b.stage === 'PRODUCTION' || 
        b.branchName === 'main' || 
        b.branchName === 'master'
      );
      
      if (!targetBranch) {
        targetBranch = branchesResponse.branches[0]; // Use first available branch
      }
      
      // Get detailed branch information
      const branchResponse = await this.amplifyClient.send(new GetBranchCommand({
        appId: appId,
        branchName: targetBranch.branchName
      }));
      
      const branch = branchResponse.branch;
      
      // Construct the URL more reliably
      let appUrl = null;
      if (branch.stage === 'PRODUCTION' && app.defaultDomain) {
        appUrl = `https://${branch.branchName}.${app.defaultDomain}`;
      } else if (app.defaultDomain) {
        // Even if not in production, show the expected URL
        appUrl = `https://${branch.branchName}.${app.defaultDomain}`;
      }

      return {
        appName: app.name,
        status: branch.stage || 'UNKNOWN',
        branch: branch.branchName,
        lastUpdated: branch.updateTime || app.updateTime,
        url: appUrl,
        // Additional debug info
        debugInfo: {
          appId: appId,
          defaultDomain: app.defaultDomain,
          totalBranches: branchesResponse.branches.length,
          availableBranches: branchesResponse.branches.map(b => ({ name: b.branchName, stage: b.stage }))
        }
      };
      
    } catch (error) {
      throw new Error(`Failed to get app status: ${error.message}. App ID: ${appId}`);
    }
  }

  async checkPrerequisites(projectPath = null) {
    const checks = [];

    // Check Node.js
    try {
      const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
      checks.push({ name: 'Node.js', installed: true, version: nodeVersion });
    } catch {
      checks.push({ 
        name: 'Node.js', 
        installed: false, 
        message: 'Install from https://nodejs.org' 
      });
    }

    // Check Git
    try {
      const gitVersion = execSync('git --version', { encoding: 'utf8' }).trim();
      checks.push({ name: 'Git', installed: true, version: gitVersion });
    } catch {
      checks.push({ 
        name: 'Git', 
        installed: false, 
        message: 'Install from https://git-scm.com' 
      });
    }

    // Check AWS CLI
    try {
      const awsVersion = execSync('aws --version', { encoding: 'utf8', timeout: 5000 }).trim();
      checks.push({ name: 'AWS CLI', installed: true, version: awsVersion });
    } catch {
      checks.push({ 
        name: 'AWS CLI', 
        installed: false, 
        message: 'Install from https://aws.amazon.com/cli/' 
      });
    }

    // Check AWS credentials - prioritize environment variables
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      checks.push({ 
        name: 'AWS Credentials', 
        installed: true, 
        message: 'Using environment variables'
      });
    } else {
      // Fall back to checking AWS CLI credentials with timeout
      try {
        execSync('aws sts get-caller-identity', { 
          encoding: 'utf8', 
          timeout: 5000,
          stdio: 'pipe'
        });
        checks.push({ 
          name: 'AWS Credentials', 
          installed: true, 
          message: 'Using AWS CLI profile'
        });
      } catch (error) {
        const isTimeout = error.code === 'TIMEOUT' || error.signal === 'SIGTERM';
        checks.push({ 
          name: 'AWS Credentials', 
          installed: false, 
          message: isTimeout 
            ? 'AWS credentials check timed out - try setting environment variables' 
            : 'Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables, or run "aws configure"' 
        });
      }
    }

    // Check GitHub token with comprehensive validation
    if (process.env.GITHUB_TOKEN) {
      try {
        // Use the same comprehensive validation as deployment
        await this.validateGitHubToken(process.env.GITHUB_TOKEN);
        
        const userResponse = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'User-Agent': 'amplify-deploy'
          }
        });
        
        if (userResponse.ok) {
          const user = await userResponse.json();
          let message = `Valid for user: ${user.login}`;
          
          // If projectPath provided, also test repository access
          if (projectPath) {
            try {
              const repoInfo = await this.ensureGitHubRepo(projectPath);
              await this.validateGitHubTokenForRepository(process.env.GITHUB_TOKEN, repoInfo);
              message += ` + repository access confirmed`;
            } catch (repoError) {
              // Don't fail the whole check if repo validation fails, just note it
              message += ` (Note: ${repoError.message.split('\n')[0]})`;
            }
          }
          
          checks.push({ 
            name: 'GitHub Token', 
            installed: true, 
            message: message
          });
        } else {
          checks.push({ 
            name: 'GitHub Token', 
            installed: false, 
            message: 'Invalid or expired token - create new token at https://github.com/settings/tokens/new'
          });
        }
      } catch (error) {
        checks.push({ 
          name: 'GitHub Token', 
          installed: false, 
          message: `Token validation failed: ${error.message.split('\n')[0]}` // First line of error
        });
      }
    } else {
              checks.push({ 
          name: 'GitHub Setup', 
          installed: false, 
          message: 'AWS Amplify GitHub App required: Choose your AWS region, install GitHub App for that region, then create token with admin:repo_hook scope'
        });
    }

    return checks;
  }

  async syncDeploymentHistoryFromAWS() {
    try {
      await this.initialize();
      
      // Get list of Amplify apps from AWS
      const listAppsResponse = await this.amplifyClient.send(new ListAppsCommand({}));
      
      const existingHistory = await this.configManager.getDeploymentHistory();
      const existingAppIds = new Set(existingHistory.map(d => d.appId));
      
      // Add any AWS apps that aren't in our local history
      for (const app of listAppsResponse.apps) {
        if (!existingAppIds.has(app.appId)) {
          // Get more details about the app
          const appResponse = await this.amplifyClient.send(new GetAppCommand({
            appId: app.appId
          }));
          
          // Try to get branch information
          let branchInfo = null;
          let appUrl = null;
          try {
            const branchResponse = await this.amplifyClient.send(new GetBranchCommand({
              appId: app.appId,
              branchName: 'main'
            }));
            branchInfo = branchResponse.branch;
            if (branchInfo.stage === 'PRODUCTION') {
              appUrl = `https://main.${appResponse.app.defaultDomain}`;
            }
          } catch (error) {
            // Branch might not exist or be named differently
          }
          
          // Add to deployment history
          await this.configManager.addDeployment({
            appId: app.appId,
            appName: app.name,
            projectPath: 'Unknown (imported from AWS)', 
            repository: app.repository || 'Unknown',
            branch: 'main',
            region: app.region || 'us-east-1',
            status: branchInfo?.stage === 'PRODUCTION' ? 'DEPLOYED' : 'UNKNOWN',
            url: appUrl,
            importedFromAWS: true
          });
        }
      }
      
      return await this.configManager.getDeploymentHistory();
      
    } catch (error) {
      throw new Error(`Failed to sync deployment history from AWS: ${error.message}`);
    }
  }
}

module.exports = { LocalDeploymentService };