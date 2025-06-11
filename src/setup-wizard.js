const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const { execSync } = require('child_process');
const { ConfigManager } = require('./config-manager');
const open = require('open');

async function setupWizard() {
  console.log(chalk.blue('\n🚀 Welcome to Amplify Deploy Setup!\n'));
  console.log(chalk.gray('This wizard will help you configure everything needed for one-click deployments.\n'));

  const configManager = new ConfigManager();
  await configManager.initialize();

  // Step 1: Check prerequisites
  console.log(chalk.yellow('Step 1: Checking prerequisites...\n'));
  await checkAndInstallPrerequisites();

  // Step 2: AWS Configuration
  console.log(chalk.yellow('\nStep 2: AWS Configuration\n'));
  await configureAWS(configManager);

  // Step 3: GitHub Configuration
  console.log(chalk.yellow('\nStep 3: GitHub Configuration\n'));
  await configureGitHub(configManager);

  // Step 4: Deployment Mode
  console.log(chalk.yellow('\nStep 4: Deployment Mode\n'));
  await configureDeploymentMode(configManager);

  // Step 5: Cursor Integration
  console.log(chalk.yellow('\nStep 5: IDE Integration\n'));
  await configureCursorIntegration();

  console.log(chalk.green('\n✅ Setup completed successfully!\n'));
  console.log(chalk.blue('Next steps:'));
  console.log(chalk.gray('1. Run "amplify-deploy start" to start the MCP server'));
  console.log(chalk.gray('2. Configure Cursor to connect to http://localhost:3456'));
  console.log(chalk.gray('3. Use the AI assistant to deploy your project!\n'));
}

async function checkAndInstallPrerequisites() {
  const prerequisites = [
    {
      name: 'Node.js',
      check: () => {
        try {
          execSync('node --version', { stdio: 'pipe' });
          return true;
        } catch {
          return false;
        }
      },
      installUrl: 'https://nodejs.org'
    },
    {
      name: 'Git',
      check: () => {
        try {
          execSync('git --version', { stdio: 'pipe' });
          return true;
        } catch {
          return false;
        }
      },
      installUrl: 'https://git-scm.com'
    },
    {
      name: 'AWS CLI',
      check: () => {
        try {
          execSync('aws --version', { stdio: 'pipe' });
          return true;
        } catch {
          return false;
        }
      },
      installUrl: 'https://aws.amazon.com/cli/'
    }
  ];

  for (const prereq of prerequisites) {
    const spinner = ora(`Checking ${prereq.name}...`).start();
    
    if (prereq.check()) {
      spinner.succeed(`${prereq.name} is installed`);
    } else {
      spinner.fail(`${prereq.name} is not installed`);
      
      const { install } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'install',
          message: `Would you like to open the installation page for ${prereq.name}?`,
          default: true
        }
      ]);

      if (install) {
        await open(prereq.installUrl);
        console.log(chalk.gray(`Opening ${prereq.installUrl} in your browser...`));
        
        await inquirer.prompt([
          {
            type: 'confirm',
            name: 'continue',
            message: `Press enter once you've installed ${prereq.name}...`
          }
        ]);

        // Check again
        if (!prereq.check()) {
          console.log(chalk.red(`${prereq.name} is still not installed. Please install it and run setup again.`));
          process.exit(1);
        }
      }
    }
  }
}

async function configureAWS(configManager) {
  // Check if AWS is already configured
  try {
    execSync('aws sts get-caller-identity', { stdio: 'pipe' });
    console.log(chalk.green('✅ AWS credentials are already configured'));
    
    const { reconfigure } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'reconfigure',
        message: 'Would you like to reconfigure AWS settings?',
        default: false
      }
    ]);

    if (!reconfigure) {
      return;
    }
  } catch {
    console.log(chalk.yellow('AWS credentials not found.'));
  }

  const { awsConfigMethod } = await inquirer.prompt([
    {
      type: 'list',
      name: 'awsConfigMethod',
      message: 'How would you like to configure AWS?',
      choices: [
        { name: 'Use AWS CLI (recommended)', value: 'cli' },
        { name: 'Enter credentials manually', value: 'manual' },
        { name: 'Use existing AWS profile', value: 'profile' },
        { name: 'Skip for now', value: 'skip' }
      ]
    }
  ]);

  switch (awsConfigMethod) {
    case 'cli':
      console.log(chalk.gray('\nRunning "aws configure"...'));
      console.log(chalk.gray('You will need your AWS Access Key ID and Secret Access Key.'));
      console.log(chalk.gray('Get them from: https://console.aws.amazon.com/iam/home#/security_credentials\n'));
      
      execSync('aws configure', { stdio: 'inherit' });
      break;

    case 'manual':
      const credentials = await inquirer.prompt([
        {
          type: 'input',
          name: 'accessKeyId',
          message: 'AWS Access Key ID:',
          validate: input => input.length > 0
        },
        {
          type: 'password',
          name: 'secretAccessKey',
          message: 'AWS Secret Access Key:',
          validate: input => input.length > 0
        },
        {
          type: 'input',
          name: 'region',
          message: 'AWS Region:',
          default: 'us-east-1'
        }
      ]);

      // For security reasons, we don't write credentials to files directly
      // Instead, guide the user to use AWS CLI
      console.log(chalk.yellow('For security, please configure AWS credentials using:'));
      console.log(chalk.gray('  aws configure'));
      console.log(chalk.gray('  Enter your credentials when prompted'));
      break;

    case 'profile':
      const { profile } = await inquirer.prompt([
        {
          type: 'input',
          name: 'profile',
          message: 'AWS Profile name:',
          default: 'default'
        }
      ]);

      await configManager.saveAWSConfig({ profile });
      break;

    case 'skip':
      console.log(chalk.yellow('⚠️  Skipping AWS configuration. You will need to configure it later.'));
      break;
  }
}

async function configureGitHub(configManager) {
  console.log(chalk.blue('🔗 GitHub Setup for AWS Amplify'));
  console.log(chalk.gray('AWS Amplify now requires the GitHub App for new deployments.\n'));
  console.log(chalk.gray('This is a 2-step process:'));
  console.log(chalk.gray('  1. Install the AWS Amplify GitHub App'));
  console.log(chalk.gray('  2. Create a Personal Access Token with admin:repo_hook scope\n'));

  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: 'Ready to set up GitHub integration?',
      default: true
    }
  ]);

  if (!proceed) {
    console.log(chalk.yellow('⚠️  Skipping GitHub configuration. You will be prompted when deploying.'));
    return;
  }

  // Step 1: Get AWS region for GitHub App installation
  console.log(chalk.yellow('\n🌍 First, we need to know your AWS region.'));
  console.log(chalk.gray('The GitHub App installation is region-specific.'));
  console.log(chalk.gray('💡 Choose us-east-1 if you\'re unsure (most common choice)\n'));

  const { region } = await inquirer.prompt([
    {
      type: 'list',
      name: 'region',
      message: 'Which AWS region will you deploy to?',
      choices: [
        { name: '🇺🇸 US East (N. Virginia) - us-east-1 (recommended)', value: 'us-east-1' },
        { name: '🇺🇸 US West (Oregon) - us-west-2', value: 'us-west-2' },
        { name: '🇪🇺 EU (Ireland) - eu-west-1', value: 'eu-west-1' },
        { name: '🇪🇺 EU (Frankfurt) - eu-central-1', value: 'eu-central-1' },
        { name: '🇦🇺 Asia Pacific (Sydney) - ap-southeast-2', value: 'ap-southeast-2' },
        { name: '🇯🇵 Asia Pacific (Tokyo) - ap-northeast-1', value: 'ap-northeast-1' },
        { name: '🌐 Other region', value: 'other' }
      ],
      default: 'us-east-1'
    }
  ]);

  let finalRegion = region;
  if (region === 'other') {
    const { customRegion } = await inquirer.prompt([
      {
        type: 'input',
        name: 'customRegion',
        message: 'Enter your AWS region (e.g., us-east-1):',
        validate: input => /^[a-z]{2}-[a-z]+-\d+$/.test(input) || 'Please enter a valid AWS region format'
      }
    ]);
    finalRegion = customRegion;
  }

  // Step 2: Install GitHub App
  await installGitHubApp(finalRegion);

  // Step 3: Create Personal Access Token
  await createPersonalAccessToken(configManager);
}

async function installGitHubApp(region) {
  const appUrl = `https://github.com/apps/aws-amplify-${region}/installations/new`;
  
  console.log(chalk.blue('\n📱 Step 1: Install AWS Amplify GitHub App'));
  console.log(chalk.green(`✅ Region selected: ${region}`));
  console.log(chalk.yellow(`🔗 GitHub App URL: ${appUrl}`));
  console.log(chalk.gray('\nIn the browser, you will need to:'));
  console.log(chalk.gray('  1. Select your GitHub account or organization'));
  console.log(chalk.gray('  2. Choose "All repositories" OR "Only select repositories"'));
  console.log(chalk.gray('  3. If selecting specific repos, include the ones you want to deploy'));
  console.log(chalk.gray('  4. Click "Install"'));
  console.log(chalk.red('  ⚠️  The GitHub App MUST match your deployment region!\n'));

  const { openApp } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'openApp',
      message: 'Open GitHub App installation page?',
      default: true
    }
  ]);

  if (openApp) {
    await open(appUrl);
  } else {
    console.log(chalk.yellow(`📋 Manual installation URL: ${appUrl}`));
  }

  const { appInstalled } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'appInstalled',
      message: 'Have you successfully installed the AWS Amplify GitHub App?',
      default: false
    }
  ]);

  if (!appInstalled) {
    console.log(chalk.yellow('⚠️  Please install the GitHub App before proceeding.'));
    console.log(chalk.gray(`Installation URL: ${appUrl}`));
    throw new Error('GitHub App installation required');
  }

  console.log(chalk.green('✅ GitHub App installation confirmed'));
}

async function createPersonalAccessToken(configManager) {
  console.log(chalk.blue('\n🔑 Step 2: Create Personal Access Token'));
  console.log(chalk.gray('Now you need to create a Personal Access Token with the correct scope.\n'));

  const tokenUrl = 'https://github.com/settings/tokens/new?scopes=admin:repo_hook&description=AWS+Amplify+Deploy+Access';

  console.log(chalk.gray('Token requirements:'));
  console.log(chalk.gray('  ✅ Token type: Classic (not fine-grained)'));
  console.log(chalk.gray('  ✅ Required scope: admin:repo_hook'));
  console.log(chalk.gray('  ✅ Description: AWS Amplify Deploy Access\n'));

  const { openToken } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'openToken',
      message: 'Open GitHub token creation page?',
      default: true
    }
  ]);

  if (openToken) {
    await open(tokenUrl);
  } else {
    console.log(chalk.yellow(`📋 Manual token creation URL: ${tokenUrl}`));
  }

  console.log(chalk.gray('\nIn the GitHub token page:'));
  console.log(chalk.gray('  1. Ensure "admin:repo_hook" scope is selected'));
  console.log(chalk.gray('  2. Set expiration as needed'));
  console.log(chalk.gray('  3. Click "Generate token"'));
  console.log(chalk.gray('  4. Copy the token immediately (you won\'t see it again)\n'));

  const { token } = await inquirer.prompt([
    {
      type: 'password',
      name: 'token',
      message: 'Paste your GitHub token here:',
      validate: input => {
        if (input.length === 0) return 'Token is required';
        if (!input.startsWith('ghp_')) return 'Token should start with "ghp_" (classic token)';
        return true;
      }
    }
  ]);

  // Validate the token before saving
  try {
    await validateGitHubAppToken(token);
    await configManager.saveGitHubToken(token);
    console.log(chalk.green('✅ GitHub token validated and saved securely'));
  } catch (error) {
    console.log(chalk.red('❌ Token validation failed:'), error.message);
    throw error;
  }
}

async function validateGitHubAppToken(token) {
  const fetch = require('node-fetch');
  
  // Basic token validation
  const response = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `token ${token}`,
      'User-Agent': 'amplify-deploy'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub token is invalid (${response.status})`);
  }

  // Check scopes
  const scopesHeader = response.headers.get('X-OAuth-Scopes');
  if (scopesHeader && !scopesHeader.includes('admin:repo_hook')) {
    throw new Error(`Token missing required scope. Current: ${scopesHeader}. Required: admin:repo_hook`);
  }

  const user = await response.json();
  console.log(chalk.gray(`Token validated for user: ${user.login}`));
}

async function configureDeploymentMode(configManager) {
  const { mode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: 'Select deployment mode:',
      choices: [
        { 
          name: 'Local (use your own AWS account)', 
          value: 'local',
          short: 'Local'
        },
        { 
          name: 'SaaS (use our deployment service - coming soon)', 
          value: 'saas',
          short: 'SaaS',
          disabled: 'Coming soon!'
        }
      ],
      default: 'local'
    }
  ]);

  const config = await configManager.getConfig() || {};
  config.mode = mode;
  await configManager.saveConfig(config);
}

async function configureCursorIntegration() {
  console.log(chalk.blue('\nTo integrate with Cursor:\n'));
  console.log('1. Start the MCP server:');
  console.log(chalk.gray('   amplify-deploy start\n'));
  console.log('2. In Cursor, add this MCP server configuration:');
  console.log(chalk.gray('   Server URL: http://localhost:3456'));
  console.log(chalk.gray('   Or for stdio mode: amplify-deploy start --stdio\n'));
  
  const { openDocs } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'openDocs',
      message: 'Would you like to open the Cursor MCP documentation?',
      default: false
    }
  ]);

  if (openDocs) {
    await open('https://docs.cursor.com/mcp');
  }
}

module.exports = { setupWizard };