const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { 
  ListToolsRequestSchema, 
  CallToolRequestSchema,
  ListToolsResultSchema,
  CallToolResultSchema 
} = require('@modelcontextprotocol/sdk/types.js');
const WebSocket = require('ws');
const express = require('express');
const { LocalDeploymentService } = require('./local-deployment');
const { SaaSDeploymentService } = require('./saas-deployment');
const chalk = require('chalk');
const { deployToAmplify } = require('./local-deployment.js');
const { AmplifyEnvManager } = require('./amplify-env-manager.js');
const ConfigManager = require('./config-manager.js');
const path = require('path');
const fs = require('fs');

class MCPServer {
  constructor(options = {}) {
    this.port = options.port || 3456;
    this.mode = options.mode || 'local';
    
    this.server = new Server({
      name: 'amplify-deploy',
      version: '1.0.0',
    }, {
      capabilities: {
        tools: {}
      }
    });
    
    this.deploymentService = this.mode === 'saas' 
      ? new SaaSDeploymentService()
      : new LocalDeploymentService();
    
    this.setupTools();
  }

  setupTools() {
    // Handle tools list requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'deploy_to_amplify',
            description: `Deploy a project to AWS Amplify with background processing and immediate feedback.

🚀 BACKGROUND DEPLOYMENT - No More Waiting:
- Returns immediately after app creation (1-2 minutes)
- Deployment continues in background (10-15 minutes total)
- Get app ID and expected URL right away
- Track progress with check_deployment_status()
- Continue working while deployment runs

🔐 ENVIRONMENT VARIABLES - Consent-Based Workflow:
If .env files are detected, the system will FIRST ask for your consent before deployment begins:
- Shows a preview of what would be synced (with masked values for security)
- Explains filtering rationale (dev vs prod variables)
- Waits for your explicit approval before proceeding

📋 sync_env_vars Parameter Options:
- undefined/not set: Auto-detect .env files and request consent BEFORE deployment
- true: Deploy and sync environment variables (manual sync after deployment)
- false: Deploy without syncing any environment variables

🚀 Recommended Usage:
1. First deployment: deploy_to_amplify(project_path="...") 
   → System detects .env files and asks for consent, then starts background deployment
2. Follow-up: deploy_to_amplify(project_path="...", sync_env_vars=true/false)
   → Deploy with your decision, background processing

⏱️ Time Expectations:
- Setup phase: 1-2 minutes (before you get response)
- Background deployment: 8-13 additional minutes
- Total time: 10-15 minutes, but you can work immediately

🔍 Smart Detection:
- Automatically finds .env files in project root or subdirectories
- Filters out development variables (localhost, NODE_ENV=development, etc.)
- Only syncs production-ready variables to keep your app secure

IMPORTANT: Always provide the absolute project_path to ensure deployment from the correct directory.`,
            inputSchema: {
              type: 'object',
              properties: {
                project_path: {
                  type: 'string',
                  description: 'REQUIRED: Absolute path to the project directory (e.g., /Users/username/my-project). Use literal spaces in paths, do NOT URL-encode.'
                },
                project_name: {
                  type: 'string',
                  description: 'Name for the Amplify app (optional, defaults to folder name)'
                },
                branch: {
                  type: 'string',
                  description: 'Git branch to deploy (default: main)',
                  default: 'main'
                },
                region: {
                  type: 'string',
                  description: 'AWS region (default: us-east-1)',
                  default: 'us-east-1'
                },
                sync_env_vars: {
                  type: 'boolean',
                  description: 'Environment variable sync decision: true (sync), false (skip), undefined (ask for consent first)'
                }
              },
              required: ['project_path']
            }
          },
          {
            name: 'check_deployment_status',
            description: 'Check the status of an AWS Amplify deployment with enhanced debugging information',
            inputSchema: {
              type: 'object',
              properties: {
                app_id: {
                  type: 'string',
                  description: 'Amplify app ID (from previous deployment)'
                }
              },
              required: ['app_id']
            }
          },
          {
            name: 'list_deployments',
            description: 'Show deployment history with formatted status, URLs, and timestamps',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false
            }
          },
          {
            name: 'sync_deployments_from_aws',
            description: 'Import existing AWS Amplify apps into local deployment history',
            inputSchema: {
              type: 'object',
              properties: {
                region: {
                  type: 'string',
                  description: 'AWS region to scan for Amplify apps (default: us-east-1)',
                  default: 'us-east-1'
                }
              }
            }
          },
          {
            name: 'generate_amplify_config',
            description: 'Generate amplify.yml configuration file for the project. Include project_path for best results.',
            inputSchema: {
              type: 'object',
              properties: {
                framework: {
                  type: 'string',
                  enum: ['react', 'nextjs', 'vue', 'angular', 'static'],
                  description: 'Framework type (react, nextjs, vue, angular, static)'
                },
                project_path: {
                  type: 'string',
                  description: 'Absolute path to the project directory (optional, but recommended for accuracy). Use literal spaces in paths, do NOT URL-encode.'
                }
              }
            }
          },
          {
            name: 'check_prerequisites',
            description: 'Check if all prerequisites (AWS credentials, GitHub token, tools) are properly configured for deployment',
            inputSchema: {
              type: 'object',
              properties: {
                project_path: {
                  type: 'string',
                  description: 'Absolute path to the project directory to check (optional, uses current directory if not specified). Use literal spaces in paths, do NOT URL-encode.'
                }
              }
            }
          },
          {
            name: 'sync_env_vars',
            description: 'Automatically sync environment variables from .env files directly to AWS Amplify app (smart filtering applied)',
            inputSchema: {
              type: 'object',
              properties: {
                project_path: {
                  type: 'string',
                  description: 'REQUIRED: Absolute path to the project directory containing .env files'
                },
                app_id: {
                  type: 'string',
                  description: 'REQUIRED: Amplify app ID to sync environment variables to'
                },
                project_name: {
                  type: 'string',
                  description: 'Project name for reference (optional, defaults to folder name)'
                },
                force_sync: {
                  type: 'boolean',
                  description: 'Force sync even if no changes detected (default: false)',
                  default: false
                }
              },
              required: ['project_path', 'app_id']
            }
          },
          {
            name: 'manage_env_vars',
            description: 'Retrieve environment variables from AWS Amplify apps (by app_id or project name)',
            inputSchema: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  enum: ['retrieve'],
                  description: 'Action to perform: retrieve (get from Amplify app)'
                },
                project_name: {
                  type: 'string',
                  description: 'Project name, app name, or app_id (app_id is preferred for direct lookup)'
                }
              },
              required: ['action', 'project_name']
            }
          },
          {
            name: 'list_env_projects',
            description: 'List all projects that have environment variables in AWS Amplify (from deployment history and live apps)',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false
            }
          }
        ]
      };
    });

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'deploy_to_amplify':
            return await this.handleDeploy(args);
          
          case 'check_deployment_status':
            return await this.handleStatus(args);
          
          case 'list_deployments':
            return await this.handleListDeployments(args);
          
          case 'sync_deployments_from_aws':
            return await this.handleSyncDeploymentsFromAWS(args);
          
          case 'generate_amplify_config':
            return await this.handleGenerateConfig(args);
          
          case 'check_prerequisites':
            return await this.handleCheckPrerequisites(args);
          
          case 'sync_env_vars':
            return await this.handleSyncEnvVars(args);
          
          case 'manage_env_vars':
            return await this.handleManageEnvVars(args);
          
          case 'list_env_projects':
            return await this.handleListEnvProjects(args);
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  // Helper method to determine the best project path
  getProjectPath(args) {
    // Check for project path in args first (highest priority)
    if (args?.project_path) {
      // Check if path is URL-encoded and fix it
      if (args.project_path.includes('%20') || args.project_path.includes('%')) {
        console.warn(`⚠️  WARNING: URL-encoded path detected: ${args.project_path}`);
        const decodedPath = decodeURIComponent(args.project_path);
        console.warn(`   Auto-correcting to: ${decodedPath}`);
        console.warn(`   In future, please use literal spaces in file paths!`);
        return decodedPath;
      }
      return args.project_path;
    }
    
    // Check PWD environment variable (user's shell working directory)
    if (process.env.PWD && process.env.PWD !== '/' && process.env.PWD !== 'C:\\') {
      return process.env.PWD;
    }
    
    // Check AMPLIFY_PROJECT_PATH environment variable
    if (process.env.AMPLIFY_PROJECT_PATH) {
      return process.env.AMPLIFY_PROJECT_PATH;
    }
    
    // Use process.cwd() but validate it's not a system directory
    const cwd = process.cwd();
    if (cwd === '/' || cwd === 'C:\\') {
      throw new Error('Unable to determine project directory. The MCP server is running from the root directory. Please:\n\n1. Make sure you opened your project folder in Cursor\n2. Or specify the project path: deploy_to_amplify(project_path="/path/to/your/project")\n3. Or set environment variable: export AMPLIFY_PROJECT_PATH="/path/to/your/project"');
    }
    
    return cwd;
  }

  // Helper method to check if .env files exist in project
  hasEnvFiles(projectPath) {
    const envFiles = ['.env', '.env.local', '.env.production'];
    
    // First check the main directory
    const hasEnvInMain = envFiles.some(file => {
      const envPath = path.join(projectPath, file);
      return fs.existsSync(envPath);
    });
    
    if (hasEnvInMain) {
      return true;
    }
    
    // If no .env files in main directory, check common subdirectories
    // This handles cases where user points to parent directory containing multiple projects
    try {
      const entries = fs.readdirSync(projectPath, { withFileTypes: true });
      const subdirs = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(name => !name.startsWith('.') && !['node_modules', 'dist', 'build'].includes(name));
      
      // Check if any subdirectory has .env files
      for (const subdir of subdirs) {
        const subdirPath = path.join(projectPath, subdir);
        const hasEnvInSubdir = envFiles.some(file => {
          const envPath = path.join(subdirPath, file);
          return fs.existsSync(envPath);
        });
        if (hasEnvInSubdir) {
          return true;
        }
      }
    } catch (error) {
      // If we can't read the directory, just return false
      return false;
    }
    
    return false;
  }

  // Helper method to find the actual project directory with .env files
  findProjectWithEnvFiles(projectPath) {
    const envFiles = ['.env', '.env.local', '.env.production'];
    
    // First check the main directory
    const hasEnvInMain = envFiles.some(file => {
      const envPath = path.join(projectPath, file);
      return fs.existsSync(envPath);
    });
    
    if (hasEnvInMain) {
      return projectPath;
    }
    
    // If no .env files in main directory, check subdirectories
    try {
      const entries = fs.readdirSync(projectPath, { withFileTypes: true });
      const subdirs = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(name => !name.startsWith('.') && !['node_modules', 'dist', 'build'].includes(name));
      
      // Return the first subdirectory that has .env files
      for (const subdir of subdirs) {
        const subdirPath = path.join(projectPath, subdir);
        const hasEnvInSubdir = envFiles.some(file => {
          const envPath = path.join(subdirPath, file);
          return fs.existsSync(envPath);
        });
        if (hasEnvInSubdir) {
          return subdirPath;
        }
      }
    } catch (error) {
      // If we can't read the directory, return the original path
    }
    
    return projectPath;
  }

  async handleDeploy(args) {
    try {
      // Require project_path for deployment
      if (!args?.project_path) {
        throw new Error('project_path is required for deployment. Please provide the absolute path to your project directory.\n\nExample: deploy_to_amplify(project_path="/Users/username/my-project", project_name="MyApp")\n\nIMPORTANT: Use literal spaces in paths - do NOT URL-encode (e.g., use "/Users/username/My Project", not "/Users/username/My%20Project")');
      }
      
      const projectPath = args.project_path;

      // Check for environment variables BEFORE deployment
      const envProjectPath = this.findProjectWithEnvFiles(projectPath);
      const hasEnvFiles = this.hasEnvFiles(projectPath);
      
      if (hasEnvFiles && args?.sync_env_vars === undefined) {
        // Environment variables detected but no user decision made - ask for consent first
        return {
          content: [
            {
              type: 'text',
              text: await this.requestEnvSyncConsent(envProjectPath, projectPath, null, args) + 
                    `\n\n🚀 Ready to deploy once you decide on environment variables.\n\n` +
                    `💡 To proceed:\n` +
                    `   • With env sync: Add sync_env_vars=true to your deployment\n` +
                    `   • Without env sync: Add sync_env_vars=false to your deployment`
            }
          ]
        };
      }

      // Start background deployment - returns immediately after app creation
      const result = await this.deploymentService.deployForMCPBackground({
        projectPath: projectPath,
        appName: args?.project_name,
        branch: args?.branch || 'main',
        region: args?.region || 'us-east-1'
      });

      // Determine deployment type for time estimates
      const isFirstTime = true; // Could be enhanced to check deployment history
      const estimatedTime = isFirstTime ? '10-15 minutes' : '5-8 minutes';

      let responseText = `🚀 AWS Amplify Deployment Started!\n\n`;
      
      // Time expectations
      responseText += `⏱️  Expected Duration: ${estimatedTime} (${isFirstTime ? 'first deployment' : 'subsequent deployment'})\n`;
      responseText += `🏗️  What's happening: Repository setup → Build → Deploy → SSL → CDN\n\n`;
      
      // App details
      responseText += `📋 App Details:\n`;
      responseText += `   🆔 App ID: ${result.appId}\n`;
      responseText += `   📱 Name: ${args?.project_name || path.basename(projectPath)}\n`;
      responseText += `   🌿 Branch: ${args?.branch || 'main'}\n`;
      responseText += `   🌍 Region: ${args?.region || 'us-east-1'}\n`;
      responseText += `   🔄 Status: ${result.status}\n\n`;
      
      // Expected URL
      responseText += `🌐 Expected URL: ${result.url}\n`;
      responseText += `   ⚠️  URL will be live once deployment completes\n\n`;
      
      // Status checking
      responseText += `📊 Track Progress:\n`;
      responseText += `   check_deployment_status(app_id="${result.appId}")\n\n`;
      
      // Productivity suggestions
      responseText += `☕ Perfect time for:\n`;
      responseText += `   • Code review or documentation\n`;
      responseText += `   • Coffee break or quick meeting\n`;
      responseText += `   • Setting up monitoring or analytics\n`;
      responseText += `   • Planning your next feature\n\n`;
      
      // Handle environment variable sync for background deployment
      if (hasEnvFiles && args?.sync_env_vars === true) {
        responseText += `🔐 Environment Variable Sync:\n`;
        responseText += `   ✅ Will sync after app is ready\n`;
        responseText += `   💡 Use sync_env_vars(project_path="${envProjectPath}", app_id="${result.appId}") to sync now\n\n`;
      } else if (hasEnvFiles && args?.sync_env_vars === false) {
        responseText += `🔐 Environment Variable Sync: Skipped (disabled by user)\n`;
        responseText += `   💡 To sync later: sync_env_vars(project_path="${envProjectPath}", app_id="${result.appId}")\n\n`;
      } else if (args?.sync_env_vars === true && !hasEnvFiles) {
        responseText += `🔐 Environment Variable Sync:\n`;
        responseText += `   ⚠️  No .env files found in project directory\n`;
        responseText += `   💡 Create .env files with your API keys and secrets, then use sync_env_vars\n\n`;
      }
      
      // Final instructions
      responseText += `🔔 Next Steps:\n`;
      responseText += `   1. Continue working - deployment runs in background\n`;
      responseText += `   2. Check status periodically with the command above\n`;
      responseText += `   3. Visit your URL once status shows "PRODUCTION"\n`;
      responseText += `   4. Monitor in AWS Console: Amplify → ${result.appId}`;

      return {
        content: [
          {
            type: 'text',
            text: responseText
          }
        ]
      };
    } catch (error) {
      // Handle errors from the setup phase (before app creation)
      return {
        content: [
          {
            type: 'text',
            text: `❌ Deployment failed: ${error.message}\n\nTroubleshooting tips:\n1. Ensure you provided the correct project_path\n2. Check that you have AWS credentials configured\n3. Verify your project has a git repository\n4. Confirm your amplify.yml is valid\n5. Make sure you opened the correct project folder in Cursor`
          }
        ],
        isError: true
      };
    }
  }

  async handleStatus(args) {
    try {
      const status = await this.deploymentService.getStatus(args.app_id);
      
      const statusEmoji = {
        'PENDING': '⏳',
        'PROVISIONING': '🔧',
        'RUNNING': '🏃',
        'SUCCEED': '✅',
        'PRODUCTION': '🎉',
        'FAILED': '❌',
        'CANCELLING': '🚫',
        'NO_BRANCHES': '🚫',
        'UNKNOWN': '❓'
      };

      // Enhanced status messages with progress context
      const statusMessages = {
        'PENDING': 'Setting up build environment...',
        'PROVISIONING': 'Preparing deployment infrastructure...',
        'RUNNING': 'Building and deploying your application...',
        'PRODUCTION': 'Live and ready! 🎉',
        'SUCCEED': 'Deployment completed successfully!',
        'FAILED': 'Deployment encountered an error',
        'CANCELLING': 'Deployment was cancelled',
        'NO_BRANCHES': 'No branches configured',
        'UNKNOWN': 'Status unclear - checking...'
      };

      // Check if this deployment is in our history for additional context
      let deploymentInfo = null;
      try {
        const deployments = await this.deploymentService.configManager.getDeploymentHistory();
        deploymentInfo = deployments.find(d => d.appId === args.app_id);
      } catch (error) {
        // History lookup failed, continue without it
      }

      // Build status response with enhanced context
      let statusText = `${statusEmoji[status.status] || '❓'} Deployment Status: ${status.status}\n`;
      statusText += `📋 ${statusMessages[status.status] || 'Processing...'}\n\n`;
      
      // App information
      statusText += `📱 App: ${status.appName}\n`;
      statusText += `🌿 Branch: ${status.branch}\n`;
      statusText += `🕐 Last updated: ${status.lastUpdated}\n`;
      
      // Show URL with status-specific messaging
      if (status.url) {
        if (status.status === 'PRODUCTION' || status.status === 'SUCCEED') {
          statusText += `🌐 Live URL: ${status.url} ✅\n`;
        } else {
          statusText += `🌐 Expected URL: ${status.url}\n`;
          statusText += `   ⏳ Will be available when deployment completes\n`;
        }
      } else {
        statusText += `⚠️  URL: Not available yet\n`;
      }
      
      // Add deployment history context if available
      if (deploymentInfo) {
        const deployedTime = new Date(deploymentInfo.timestamp);
        const timeElapsed = Math.round((Date.now() - deployedTime.getTime()) / 1000 / 60); // minutes
        
        statusText += `\n📊 Deployment Info:\n`;
        statusText += `   📁 Project: ${deploymentInfo.projectPath || 'Unknown'}\n`;
        statusText += `   🗓️  Started: ${deployedTime.toLocaleString()}\n`;
        statusText += `   ⏱️  Time elapsed: ${timeElapsed} minute${timeElapsed !== 1 ? 's' : ''}\n`;
      }
      
      // Add helpful next steps based on status
      if (status.status === 'PENDING' || status.status === 'PROVISIONING') {
        const estimatedRemaining = deploymentInfo ? Math.max(0, 15 - Math.round((Date.now() - new Date(deploymentInfo.timestamp).getTime()) / 1000 / 60)) : 10;
        statusText += `\n⏱️  Estimated time remaining: ${estimatedRemaining}-${estimatedRemaining + 5} minutes\n`;
        statusText += `🏗️  Currently: Setting up build environment and dependencies\n`;
        statusText += `💡 Check again in 3-5 minutes for build progress`;
      } else if (status.status === 'RUNNING') {
        const estimatedRemaining = deploymentInfo ? Math.max(0, 12 - Math.round((Date.now() - new Date(deploymentInfo.timestamp).getTime()) / 1000 / 60)) : 8;
        statusText += `\n⏱️  Estimated time remaining: ${estimatedRemaining}-${estimatedRemaining + 3} minutes\n`;
        statusText += `🔨 Currently: Building application and optimizing assets\n`;
        statusText += `💡 This is the longest phase - great time for a coffee break! ☕`;
      } else if (status.status === 'PRODUCTION' || status.status === 'SUCCEED') {
        statusText += `\n🎉 Deployment completed successfully!\n`;
        statusText += `✅ Your app is live and accessible at the URL above\n`;
        statusText += `🚀 Ready for production traffic!`;
        
        // Suggest environment variable sync if applicable
        if (deploymentInfo) {
          statusText += `\n\n💡 Don't forget to sync environment variables if needed:\n`;
          statusText += `   sync_env_vars(project_path="${deploymentInfo.projectPath}", app_id="${args.app_id}")`;
        }
      } else if (status.status === 'FAILED') {
        statusText += `\n❌ Deployment failed\n`;
        statusText += `🔍 Check the AWS Amplify Console for detailed error logs\n`;
        statusText += `🔗 AWS Console: https://console.aws.amazon.com/amplify/home#/${args.app_id}\n`;
        statusText += `💡 Common fixes:\n`;
        statusText += `   • Check build settings in amplify.yml\n`;
        statusText += `   • Verify all dependencies are in package.json\n`;
        statusText += `   • Ensure build commands are correct\n`;
        statusText += `   • Check for environment variable issues`;
      } else if (status.status === 'NO_BRANCHES') {
        statusText += `\n⚠️  No branches found for this app\n`;
        statusText += `🔧 This might indicate an issue with app setup\n`;
        statusText += `💡 Try redeploying or check AWS Console`;
      }
      
      // Add debug information if status seems unusual
      if (!status.url || status.status === 'UNKNOWN' || status.status === 'NO_BRANCHES') {
        statusText += `\n\n🔍 Debug Information:\n`;
        statusText += `   • App ID: ${status.debugInfo?.appId}\n`;
        statusText += `   • Default Domain: ${status.debugInfo?.defaultDomain || 'Not set'}\n`;
        statusText += `   • Total Branches: ${status.debugInfo?.totalBranches || 0}\n`;
        if (status.debugInfo?.availableBranches && status.debugInfo.availableBranches.length > 0) {
          statusText += `   • Available Branches: ${status.debugInfo.availableBranches.map(b => `${b.name} (${b.stage})`).join(', ')}\n`;
        }
      }

      // Add refresh reminder
      statusText += `\n\n🔄 Refresh status: check_deployment_status(app_id="${args.app_id}")`;

      return {
        content: [
          {
            type: 'text',
            text: statusText
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to get status: ${error.message}\n\n💡 Make sure the app_id is correct. Use list_deployments to see your recent deployments.\n\n🔍 If the app exists in AWS Console but status check fails, there might be a permissions issue with your AWS credentials.`
          }
        ],
        isError: true
      };
    }
  }

  async handleListDeployments(args) {
    try {
      const deployments = await this.deploymentService.configManager.getDeploymentHistory();
      
      if (deployments.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No deployment history found. Deploy a project first using deploy_to_amplify.'
            }
          ]
        };
      }
      
      const limit = args?.limit || 10;
      const recentDeployments = deployments.slice(0, limit);
      
      const formatDeployment = (deployment, index) => {
        const statusEmoji = {
          'CREATED': '🆕',
          'DEPLOYING': '⏳', 
          'DEPLOYED': '✅',
          'FAILED': '❌',
          'IN_PROGRESS': '🔄'
        };
        
        return `${index + 1}. ${deployment.appName || 'Unnamed App'}
   📱 App ID: ${deployment.appId}
   ${statusEmoji[deployment.status] || '❓'} Status: ${deployment.status}
   🌐 URL: ${deployment.url || 'Pending...'}
   📁 Project: ${deployment.projectPath || 'Unknown'}
   🗓️  Deployed: ${new Date(deployment.timestamp).toLocaleString()}`;
      };

      const deploymentText = recentDeployments.map(formatDeployment).join('\n\n');
      
      const summary = `📋 Recent AWS Amplify Deployments (${recentDeployments.length} of ${deployments.length})\n\n${deploymentText}\n\n💡 Tip: Use check_deployment_status(app_id="APP_ID") to get current status of any deployment.`;

      return {
        content: [
          {
            type: 'text',
            text: summary
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to list deployments: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  async handleSyncDeploymentsFromAWS(args) {
    try {
      const deployments = await this.deploymentService.syncDeploymentHistoryFromAWS();
      
      // Count how many were actually imported (not duplicates)
      const importedCount = deployments.filter(d => d.importedFromAWS).length;
      
      if (importedCount === 0) {
        return {
          content: [
            {
              type: 'text',
              text: '✅ Sync completed! No new deployments found in AWS (all existing apps are already in your history).\n\n💡 Use list_deployments to see your current deployment history.'
            }
          ]
        };
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `🎉 Successfully imported ${importedCount} deployment(s) from AWS!\n\nYour local deployment history now includes all AWS Amplify apps from your account.\n\n💡 Use list_deployments to see the updated history.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to sync deployments from AWS: ${error.message}\n\n💡 Make sure your AWS credentials are configured and you have access to AWS Amplify.`
          }
        ],
        isError: true
      };
    }
  }

  async handleGenerateConfig(args) {
    try {
      let projectPath;
      try {
        projectPath = args?.project_path ? args.project_path : this.getProjectPath(args);
      } catch (error) {
        // If we can't determine project path, use current working directory as fallback
        projectPath = process.cwd();
      }
      
      if (!args?.framework) {
        // Auto-detect framework if not provided
        const framework = await this.deploymentService.detectFramework(projectPath);
        const config = await this.deploymentService.generateAmplifyConfig(framework, projectPath);
        
        return {
          content: [
            {
              type: 'text',
              text: `Auto-detected framework: ${framework}\n\nGenerated amplify.yml configuration:\n\n\`\`\`yaml\n${config}\n\`\`\`\n\nProject Path: ${projectPath}`
            }
          ]
        };
      } else {
        const config = await this.deploymentService.generateAmplifyConfig(args.framework, projectPath);
        
        return {
          content: [
            {
              type: 'text',
              text: `Generated amplify.yml configuration for ${args.framework}:\n\n\`\`\`yaml\n${config}\n\`\`\`\n\nProject Path: ${projectPath}`
            }
          ]
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to generate config: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  async handleCheckPrerequisites(args) {
    try {
      let projectPath;
      try {
        projectPath = args?.project_path ? args.project_path : this.getProjectPath(args);
      } catch (error) {
        // If we can't determine project path, use current working directory as fallback
        projectPath = process.cwd();
      }
      
      // Pass project path to get comprehensive GitHub validation
      const results = await this.deploymentService.checkPrerequisites(projectPath);
      
      const formatResult = (item) => {
        if (item.installed) {
          return `✅ ${item.name}: ${item.message || item.version || 'OK'}`;
        } else {
          return `❌ ${item.name}: ${item.message}`;
        }
      };

      const resultText = results.map(formatResult).join('\n');
      const allGood = results.every(r => r.installed);
      
      const summary = allGood 
        ? '\n🎉 All prerequisites are satisfied!' 
        : '\n⚠️  Please fix the issues above before deploying.';

      return {
        content: [
          {
            type: 'text',
            text: `Prerequisites Check:\n\n${resultText}${summary}\n\nProject Path: ${projectPath}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to check prerequisites: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  async handleSyncEnvVars(args) {
    const { project_path, app_id, project_name, force_sync = false } = args;
    
    if (!project_path) {
      throw new Error('project_path is required');
    }
    
    if (!app_id) {
      throw new Error('app_id is required');
    }

    const envManager = new AmplifyEnvManager(process.env.AWS_REGION || 'us-east-1');
    const finalProjectName = project_name || path.basename(project_path);
    
    const results = await envManager.autoSyncFromEnvFile(project_path, app_id, finalProjectName);
    
    // Format the response
    let responseText = `🔐 Environment Variable Sync Results\n\n`;
    
    if (results.envFileRead) {
      responseText += `✅ Found and read .env files\n`;
      responseText += `📊 Variables found: ${results.envVarsFound}\n`;
      responseText += `🔍 Production variables (dev/localhost filtered out)\n\n`;
      
      if (results.synced) {
        responseText += `🚀 Successfully synced ${results.envVarsFound} variables to Amplify app: ${app_id}\n`;
        responseText += `💡 Variables are now available in your app during build and runtime.\n`;
        responseText += `🔗 View in AWS Console: Amplify → ${app_id} → Environment variables`;
      } else {
        responseText += `❌ Failed to sync to Amplify app: ${app_id}\n`;
      }
      
    } else {
      responseText += `❌ No .env files found in project directory\n`;
      responseText += `💡 Create a .env file with your API keys, database URLs, and other environment variables.\n`;
    }
    
    if (results.errors.length > 0) {
      responseText += `\n⚠️ Issues:\n`;
      for (const error of results.errors) {
        responseText += `  • ${error}\n`;
      }
    }
    
    return {
      content: [{
        type: "text",
        text: responseText
      }]
    };
  }

  async handleManageEnvVars(args) {
    const { 
      action, 
      project_name, 
      env_vars = {}, 
      project_path,
      app_id 
    } = args;
    
    const envManager = new AmplifyEnvManager(process.env.AWS_REGION || 'us-east-1');
    let responseText = '';
    
    switch (action) {
      case 'retrieve':
        if (!project_name) {
          throw new Error('project_name is required for retrieve action. You can also use an app_id instead.');
        }
        
        // Check if project_name is actually an app_id (starts with 'd' and has right format)
        const isAppId = /^d[a-z0-9]+$/i.test(project_name);
        
        if (isAppId) {
          // Treat as app_id and get directly from Amplify
          const { success, envVars, appName, error } = await envManager.getAmplifyAppEnvVars(project_name);
          
          if (success) {
            responseText = `🔍 Environment Variables for ${appName} (${project_name})\n\n`;
            if (Object.keys(envVars).length === 0) {
              responseText += `No environment variables found for this app.\n`;
            } else {
              responseText += `Found ${Object.keys(envVars).length} environment variable${Object.keys(envVars).length !== 1 ? 's' : ''}:\n\n`;
              const formatted = envManager.formatEnvVarsForDisplay(envVars);
              for (const envVar of formatted) {
                responseText += `🔑 ${envVar.key}: ${envVar.value} (${envVar.type})\n`;
              }
              responseText += `\n💡 These variables are live in your Amplify app and available during builds.`;
            }
          } else {
            responseText = `❌ Failed to retrieve variables from Amplify app: ${error}\n`;
          }
        } else {
          // Try to find app by project name in deployment history
          try {
            const ConfigManager = require('./config-manager.js');
            const configManager = new ConfigManager();
            const deployments = await configManager.getDeploymentHistory();
            
            const deployment = deployments.find(d => 
              d.appName === project_name || 
              (d.projectPath && d.projectPath.includes(project_name))
            );
            
            if (deployment && deployment.appId) {
              const { success, envVars, appName, error } = await envManager.getAmplifyAppEnvVars(deployment.appId);
              
              if (success) {
                responseText = `🔍 Environment Variables for ${appName} (${deployment.appId})\n\n`;
                if (Object.keys(envVars).length === 0) {
                  responseText += `No environment variables found for this project.\n`;
                } else {
                  responseText += `Found ${Object.keys(envVars).length} environment variable${Object.keys(envVars).length !== 1 ? 's' : ''}:\n\n`;
                  const formatted = envManager.formatEnvVarsForDisplay(envVars);
                  for (const envVar of formatted) {
                    responseText += `🔑 ${envVar.key}: ${envVar.value} (${envVar.type})\n`;
                  }
                  responseText += `\n💡 These variables are live in your Amplify app.`;
                }
              } else {
                responseText = `❌ Failed to retrieve variables: ${error}\n`;
              }
            } else {
              responseText = `❌ Project '${project_name}' not found in deployment history.\n`;
              responseText += `💡 Use list_env_projects to see available projects, or use the exact app_id instead.`;
            }
          } catch (historyError) {
            responseText = `❌ Failed to access deployment history: ${historyError.message}\n`;
            responseText += `💡 Try using the app_id directly instead of project name.`;
          }
        }
        break;
        
      default:
        throw new Error(`Unknown action: ${action}. Valid actions: retrieve. Use sync_env_vars to automatically sync .env files to Amplify.`);
    }
    
    return {
      content: [{
        type: "text",
        text: responseText
      }]
    };
  }

  async handleListEnvProjects(args) {
    const envManager = new AmplifyEnvManager(process.env.AWS_REGION || 'us-east-1');
    
    try {
      // Get projects from deployment history
      const historyProjects = await envManager.listProjectsFromDeploymentHistory();
      
      // Get all Amplify apps with environment variables
      const { success: amplifySuccess, apps } = await envManager.listAmplifyAppsWithEnvVars();
      
      if (!amplifySuccess) {
        throw new Error(`Failed to list Amplify apps: ${apps.error || 'Unknown error'}`);
      }
      
      let responseText = `🗂️ Projects with Environment Variables\n\n`;
      
      // Combine and deduplicate projects
      const allProjects = new Map();
      
      // Add from deployment history
      for (const project of historyProjects) {
        allProjects.set(project.projectName, {
          projectName: project.projectName,
          source: 'deployment_history'
        });
      }
      
      // Add from live Amplify apps
      for (const app of apps) {
        if (!allProjects.has(app.name)) {
          allProjects.set(app.name, {
            projectName: app.name,
            appId: app.appId,
            envVarCount: app.envVarCount,
            source: 'amplify_app'
          });
        } else {
          // Update with Amplify details if we have deployment history entry
          const existing = allProjects.get(app.name);
          existing.appId = app.appId;
          existing.envVarCount = app.envVarCount;
        }
      }
      
      if (allProjects.size === 0) {
        responseText += `No projects found with environment variables.\n`;
        responseText += `\n💡 Deploy an app and use sync_env_vars to set up environment variables.\n`;
      } else {
        responseText += `Found ${allProjects.size} project(s) with environment variables:\n\n`;
        
        for (const [name, project] of allProjects) {
          responseText += `📁 ${project.projectName}\n`;
          if (project.appId) {
            responseText += `   🆔 App ID: ${project.appId}\n`;
          }
          if (project.envVarCount) {
            responseText += `   📊 ${project.envVarCount} variable${project.envVarCount !== 1 ? 's' : ''}\n`;
          }
          responseText += `   📍 Source: ${project.source === 'deployment_history' ? 'Deployment History' : 'Amplify Console'}\n`;
          responseText += '\n';
        }
        
        responseText += `💡 Use manage_env_vars with action 'retrieve' and the app_id to see variables for a specific project.\n`;
        responseText += `🔍 Or check the AWS Amplify Console → Environment variables tab.`;
      }
      
      return {
        content: [{
          type: "text",
          text: responseText
        }]
      };
      
    } catch (error) {
      throw new Error(`Failed to list projects: ${error.message}`);
    }
  }

  // Helper method to perform environment variable sync
  async performEnvSync(envProjectPath, originalProjectPath, appId, args) {
    let responseText = `\n\n🔐 Environment Variable Sync`;
    
    try {
      const { AmplifyEnvManager } = require('./amplify-env-manager.js');
      const envManager = new AmplifyEnvManager(args?.region || 'us-east-1');
      
      const envResult = await envManager.autoSyncFromEnvFile(
        envProjectPath,
        appId, 
        args?.project_name || path.basename(envProjectPath)
      );

      if (envResult.synced && envResult.envVarsFound > 0) {
        responseText += `\n✅ Successfully synced ${envResult.envVarsFound} environment variable${envResult.envVarsFound !== 1 ? 's' : ''} to your app!`;
        responseText += `\n💡 Variables are now available during builds and runtime.`;
        
        if (envProjectPath !== originalProjectPath) {
          responseText += `\n📁 Found .env files in: ${path.relative(originalProjectPath, envProjectPath)}`;
        }
      } else if (envResult.envVarsFound === 0) {
        responseText += `\n⚠️  Found .env files but no production variables to sync (development variables filtered out).`;
      } else if (envResult.errors.length > 0) {
        responseText += `\n❌ Environment sync had issues:`;
        for (const error of envResult.errors) {
          responseText += `\n  • ${error}`;
        }
      }
    } catch (envError) {
      responseText += `\n❌ Environment sync failed: ${envError.message}`;
      responseText += `\n💡 You can manually sync later with: sync_env_vars(project_path="${envProjectPath}", app_id="${appId}")`;
    }
    
    return responseText;
  }

  // Helper method to request consent for environment variable sync
  async requestEnvSyncConsent(envProjectPath, originalProjectPath, appId, args) {
    let responseText = `\n\n🔐 Environment Variables Detected`;
    
    try {
      const { AmplifyEnvManager } = require('./amplify-env-manager.js');
      const envManager = new AmplifyEnvManager(args?.region || 'us-east-1');
      
      // Parse and filter the environment variables to show what would be synced
      const envFiles = ['.env', '.env.local', '.env.production'];
      let allEnvVars = {};
      
      for (const envFile of envFiles) {
        const envPath = path.join(envProjectPath, envFile);
        if (fs.existsSync(envPath)) {
          try {
            const fileVars = envManager.parseEnvFile(envPath);
            allEnvVars = { ...allEnvVars, ...fileVars };
          } catch (error) {
            // Skip files with parse errors
          }
        }
      }
      
      const filteredVars = envManager.filterProductionVars(allEnvVars);
      const excludedCount = Object.keys(allEnvVars).length - Object.keys(filteredVars).length;
      
      if (Object.keys(filteredVars).length > 0) {
        responseText += `\n\n📋 Preview of environment variables that would be synced:`;
        
        if (envProjectPath !== originalProjectPath) {
          responseText += `\n📁 Found in: ${path.relative(originalProjectPath, envProjectPath)}`;
        }
        
        responseText += `\n\n✅ Production variables (${Object.keys(filteredVars).length}):`;
        const formatted = envManager.formatEnvVarsForDisplay(filteredVars);
        for (const envVar of formatted.slice(0, 10)) { // Show max 10 for readability
          responseText += `\n   🔑 ${envVar.key}: ${envVar.value} (${envVar.type})`;
        }
        
        if (formatted.length > 10) {
          responseText += `\n   ... and ${formatted.length - 10} more`;
        }
        
        if (excludedCount > 0) {
          responseText += `\n\n🚫 Development variables filtered out (${excludedCount}):`;
          responseText += `\n   (NODE_ENV, PORT, localhost URLs, etc.)`;
        }
        
        responseText += `\n\n❓ Would you like to sync these ${Object.keys(filteredVars).length} environment variables to your Amplify app?`;
        responseText += `\n\n💡 To approve: Re-run deployment with sync_env_vars=true`;
        responseText += `\n💡 To decline: Use sync_env_vars=false`;
        responseText += `\n💡 To sync manually later: sync_env_vars(project_path="${envProjectPath}", app_id="${appId}")`;
      } else {
        responseText += `\n⚠️  Found .env files but no production variables to sync (development variables filtered out).`;
        if (excludedCount > 0) {
          responseText += `\n🚫 ${excludedCount} development variables were filtered out (NODE_ENV, PORT, localhost URLs, etc.)`;
        }
      }
      
    } catch (error) {
      responseText += `\n❌ Error previewing environment variables: ${error.message}`;
      responseText += `\n💡 You can manually sync later with: sync_env_vars(project_path="${envProjectPath}", app_id="${appId}")`;
    }
    
    return responseText;
  }

  async start() {
    // For stdio mode (when called from Cursor)
    if (process.argv.includes('--stdio')) {
      try {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        // Don't log to console in stdio mode as it interferes with MCP communication
        return;
      } catch (error) {
        // Write to stderr for debugging without interfering with stdio
        process.stderr.write(`MCP Server error: ${error.message}\n`);
        process.exit(1);
      }
    }

    // For WebSocket mode (development/testing)
    const app = express();
    const server = app.listen(this.port);
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws) => {
      console.log(chalk.green('Client connected'));
      
      ws.on('message', async (message) => {
        try {
          const request = JSON.parse(message);
          // Simple echo for testing - in production you'd route to the MCP server
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            result: { message: 'MCP Server is running' },
            id: request.id
          }));
        } catch (error) {
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: error.message },
            id: null
          }));
        }
      });

      ws.on('close', () => {
        console.log(chalk.yellow('Client disconnected'));
      });
    });

    console.log(chalk.green(`WebSocket server listening on port ${this.port}`));
  }
}

module.exports = { MCPServer };