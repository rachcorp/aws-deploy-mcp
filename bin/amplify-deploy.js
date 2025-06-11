#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const { version } = require('../package.json');
const { MCPServer } = require('../src/mcp-server');
const { LocalDeploymentService } = require('../src/local-deployment');
const { ConfigManager } = require('../src/config-manager');
const { setupWizard } = require('../src/setup-wizard');

program
  .name('amplify-deploy')
  .description('Deploy your app to AWS Amplify with one command')
  .version(version);

program
  .command('init')
  .description('Initialize amplify-deploy in your project')
  .option('-p, --project <path>', 'Project path', process.cwd())
  .action(async (options) => {
    console.log(chalk.blue('🚀 Initializing Amplify Deploy...'));
    
    try {
      const config = new ConfigManager(options.project);
      await config.initialize();
      console.log(chalk.green('✅ Amplify Deploy initialized successfully!'));
      console.log(chalk.gray('Run "amplify-deploy start" to start the MCP server'));
    } catch (error) {
      console.error(chalk.red('❌ Initialization failed:'), error.message);
      process.exit(1);
    }
  });

program
  .command('start')
  .description('Start the MCP server for Cursor integration')
  .option('-p, --port <port>', 'Port to run the MCP server', '3456')
  .option('-m, --mode <mode>', 'Run mode: local or saas', 'local')
  .option('--stdio', 'Run in stdio mode for MCP integration')
  .action(async (options) => {
    if (options.stdio) {
      // Run in stdio mode for MCP integration
      try {
        const server = new MCPServer({
          mode: options.mode
        });
        
        await server.start(); // This will detect --stdio from process.argv
        
      } catch (error) {
        console.error(chalk.red('❌ Failed to start MCP server:'), error.message);
        process.exit(1);
      }
    } else {
      console.log(chalk.blue('🚀 Starting Amplify Deploy MCP Server...'));
      
      try {
        const server = new MCPServer({
          port: parseInt(options.port),
          mode: options.mode
        });
        
        await server.start();
        
        console.log(chalk.green(`✅ MCP Server running on port ${options.port}`));
        console.log(chalk.gray('\nConfigure Cursor to connect to:'));
        console.log(chalk.yellow(`  http://localhost:${options.port}`));
        console.log(chalk.gray('\nPress Ctrl+C to stop the server'));
        
      } catch (error) {
        console.error(chalk.red('❌ Failed to start server:'), error.message);
        process.exit(1);
      }
    }
  });

program
  .command('deploy')
  .description('Deploy current project to AWS Amplify')
  .option('-n, --name <name>', 'App name (defaults to folder name)')
  .option('-b, --branch <branch>', 'Git branch to deploy', 'main')
  .option('-r, --region <region>', 'AWS region', 'us-east-1')
  .action(async (options) => {
    console.log(chalk.blue('🚀 Deploying to AWS Amplify...'));
    
    try {
      const deploymentService = new LocalDeploymentService();
      const result = await deploymentService.deploy({
        projectPath: process.cwd(),
        appName: options.name,
        branch: options.branch,
        region: options.region
      });
      
      console.log(chalk.green('✅ Deployment successful!'));
      console.log(chalk.yellow(`🌐 Your app is live at: ${result.url}`));
      
    } catch (error) {
      console.error(chalk.red('❌ Deployment failed:'), error.message);
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('Setup wizard for first-time configuration')
  .action(async () => {
    console.log(chalk.blue('🔧 Amplify Deploy Setup Wizard'));
    
    try {
      await setupWizard();
      console.log(chalk.green('✅ Setup completed successfully!'));
    } catch (error) {
      console.error(chalk.red('❌ Setup failed:'), error.message);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check deployment status')
  .option('-a, --app <appId>', 'Amplify app ID')
  .action(async (options) => {
    try {
      const deploymentService = new LocalDeploymentService();
      const status = await deploymentService.getStatus(options.app);
      
      console.log(chalk.blue('📊 Deployment Status:'));
      console.log(`  Status: ${status.status}`);
      console.log(`  URL: ${status.url || 'Not available yet'}`);
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to get status:'), error.message);
    }
  });

program
  .command('env-setup')
  .description('Show AWS environment variables setup instructions')
  .action(async () => {
    console.log(chalk.blue('🔐 AWS Environment Variables Setup'));
    console.log(chalk.blue('=================================='));
    console.log('');
    console.log('To use environment variables for AWS credentials, set these variables:');
    console.log('');
    console.log(chalk.yellow('Required:'));
    console.log('  export AWS_ACCESS_KEY_ID="your-access-key-id"');
    console.log('  export AWS_SECRET_ACCESS_KEY="your-secret-access-key"');
    console.log('');
    console.log(chalk.yellow('Optional:'));
    console.log('  export AWS_REGION="us-east-1"  # Default region');
    console.log('  export AWS_SESSION_TOKEN="your-session-token"  # For temporary credentials');
    console.log('');
    console.log('Add to your shell profile (~/.bashrc, ~/.zshrc, ~/.profile):');
    console.log('');
    console.log(chalk.green('# AWS Credentials for Amplify Deploy'));
    console.log(chalk.green('export AWS_ACCESS_KEY_ID="your-access-key-id"'));
    console.log(chalk.green('export AWS_SECRET_ACCESS_KEY="your-secret-access-key"'));
    console.log(chalk.green('export AWS_REGION="us-east-1"'));
    console.log('');
    console.log('After setting variables, restart your terminal and Cursor.');
  });

program
  .command('check')
  .description('Check all prerequisites and project readiness for deployment')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action(async (options) => {
    console.log(chalk.blue('🔍 Checking all prerequisites and project readiness...'));
    console.log('');
    
    try {
      const deploymentService = new LocalDeploymentService();
      
      // 1. Check prerequisites (includes GitHub token validation)
      console.log(chalk.blue('📋 Prerequisites:'));
      const checks = await deploymentService.checkPrerequisites(options.path);
      
      let allGood = true;
      checks.forEach(check => {
        if (check.installed) {
          console.log(chalk.green(`  ✅ ${check.name}: ${check.message || check.version || 'OK'}`));
        } else {
          console.log(chalk.red(`  ❌ ${check.name}: ${check.message}`));
          allGood = false;
        }
      });
      
      if (!allGood) {
        console.log('');
        console.log(chalk.yellow('💡 Fix the issues above before deploying.'));
        console.log(chalk.gray('Run "amplify-deploy env-setup" for AWS setup instructions.'));
        process.exit(1);
      }
      
      console.log('');
      
      // 2. Check project structure
      console.log(chalk.blue('📁 Project Structure:'));
      console.log(chalk.gray('  Validating project...'));
      await deploymentService.validateProject(options.path);
      console.log(chalk.green('  ✅ Project structure is valid'));
      
      // 3. Check framework detection
      console.log(chalk.gray('  Detecting framework...'));
      const framework = await deploymentService.detectFramework(options.path);
      console.log(chalk.green(`  ✅ Framework detected: ${framework}`));
      
      // 4. Check config generation
      console.log(chalk.gray('  Testing amplify.yml generation...'));
      const config = await deploymentService.generateAmplifyConfig(framework, options.path);
      console.log(chalk.green('  ✅ amplify.yml can be generated'));
      
      // 5. Check Git repository
      console.log(chalk.gray('  Checking Git repository...'));
      const repoInfo = await deploymentService.ensureGitHubRepo(options.path);
      console.log(chalk.green(`  ✅ GitHub repository: ${repoInfo.repository}`));
      
      console.log('');
      console.log(chalk.green('🎉 Everything looks good! Ready for deployment.'));
      console.log('');
      console.log(chalk.blue('📊 Summary:'));
      console.log(chalk.gray(`  • Framework: ${framework}`));
      console.log(chalk.gray(`  • Repository: ${repoInfo.repository}`));
      console.log(chalk.gray(`  • Config size: ${config.length} characters`));
      console.log('');
      console.log(chalk.yellow('To deploy: amplify-deploy deploy'));
      
    } catch (error) {
      console.log('');
      console.error(chalk.red('❌ Check failed:'), error.message);
      
      // Provide helpful hints
      if (error.message.includes('GitHub token')) {
        console.log(chalk.yellow('\n💡 GitHub Token Issues:'));
        console.log(chalk.yellow('   • Create token: https://github.com/settings/tokens/new'));
        console.log(chalk.yellow('   • Select "repo" scope'));
        console.log(chalk.yellow('   • Add to ~/.cursor/mcp.json or export GITHUB_TOKEN'));
      } else if (error.message.includes('AWS credentials')) {
        console.log(chalk.yellow('\n💡 AWS Credentials Issues:'));
        console.log(chalk.yellow('   • Run: amplify-deploy env-setup'));
        console.log(chalk.yellow('   • Or set environment variables'));
      } else if (error.message.includes('No HTML files found')) {
        console.log(chalk.yellow('\n💡 For static sites, make sure you have:'));
        console.log(chalk.yellow('   • At least one .html file (like index.html)'));
        console.log(chalk.yellow('   • Git repository initialized (git init)'));
      } else if (error.message.includes('No package.json found')) {
        console.log(chalk.yellow('\n💡 For JavaScript projects, make sure you have:'));
        console.log(chalk.yellow('   • package.json in your project root'));
        console.log(chalk.yellow('   • Git repository initialized (git init)'));
      }
      
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate if the current project is ready for deployment')
  .option('-p, --path <path>', 'Project path', process.cwd())
  .action(async (options) => {
    console.log(chalk.blue('🔍 Validating project for deployment...'));
    
    try {
      const deploymentService = new LocalDeploymentService();
      
      // Test project validation
      console.log(chalk.gray('Checking project structure...'));
      await deploymentService.validateProject(options.path);
      console.log(chalk.green('✅ Project structure is valid'));
      
      // Test framework detection
      console.log(chalk.gray('Detecting framework...'));
      const framework = await deploymentService.detectFramework(options.path);
      console.log(chalk.green(`✅ Framework detected: ${framework}`));
      
      // Test config generation
      console.log(chalk.gray('Testing amplify.yml generation...'));
      const config = await deploymentService.generateAmplifyConfig(framework, options.path);
      console.log(chalk.green('✅ amplify.yml can be generated'));
      
      console.log(chalk.green('\n🎉 Project is ready for deployment!'));
      console.log(chalk.gray(`Framework: ${framework}`));
      console.log(chalk.gray(`Config size: ${config.length} characters`));
      console.log('');
      console.log(chalk.yellow('💡 To check all prerequisites: amplify-deploy check'));
      
    } catch (error) {
      console.error(chalk.red('❌ Validation failed:'), error.message);
      
      if (error.message.includes('No HTML files found')) {
        console.log(chalk.yellow('\n💡 For static sites, make sure you have:'));
        console.log(chalk.yellow('   • At least one .html file (like index.html)'));
        console.log(chalk.yellow('   • Git repository initialized (git init)'));
      } else if (error.message.includes('No package.json found')) {
        console.log(chalk.yellow('\n💡 For JavaScript projects, make sure you have:'));
        console.log(chalk.yellow('   • package.json in your project root'));
        console.log(chalk.yellow('   • Git repository initialized (git init)'));
      }
      
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}