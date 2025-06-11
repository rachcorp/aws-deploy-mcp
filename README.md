# Amplify Deploy

One-click deployment from your IDE to AWS Amplify. Deploy your web applications without leaving your code editor!

## Features

- 🚀 **One-Click Deployment**: Deploy to AWS Amplify with a single command
- 🤖 **AI-Powered**: Integrates with Cursor IDE via MCP (Model Context Protocol)
- 🔧 **Zero Config**: Automatically detects framework and generates build settings
- 🔐 **Secure**: Uses AWS IAM and GitHub OAuth for authentication
- 📦 **Framework Support**: React, Next.js, Vue, Angular, and static sites
- 🌐 **Local or SaaS**: Run locally with your AWS account or use our managed service (coming soon)
- ⚡ **Environment Variables**: Automatically syncs .env files during deployment with smart filtering

## Quick Start

```bash
# Run the setup wizard
npx aws-deploy-mcp setup

# Start the MCP server
npx aws-deploy-mcp start

# Or deploy directly from CLI
npx aws-deploy-mcp deploy
```

## Installation

### Prerequisites

- Node.js 18+
- Git
- AWS CLI (for local mode)
- AWS Account (for local mode)
- GitHub Account

### Setup

1. Run the setup wizard:
   ```bash
   npx aws-deploy-mcp setup
   ```

2. Follow the interactive setup to configure:
   - AWS credentials
   - GitHub authentication
   - Deployment mode (local/SaaS)

3. Start the MCP server:
   ```bash
   npx aws-deploy-mcp start
   ```

4. Configure your IDE (Cursor) to connect to `http://localhost:3456`

## Usage

### In Cursor IDE

Once the MCP server is running, you can use natural language commands:

- "Deploy this project to AWS Amplify"
- "Check my deployment status"
- "Generate amplify config"
- "Check prerequisites"

**Important**: The AI will ask for your project's absolute path to ensure deployment from the correct directory. For best results, open your project folder in Cursor before requesting deployment.

**File Paths with Spaces**: Use literal spaces in file paths (e.g., `/Users/username/My Project`), not URL-encoded paths (e.g., `/Users/username/My%20Project`).

**For AI Developers**: See [AI_AGENT_GUIDE.md](AI_AGENT_GUIDE.md) for detailed guidance on using the MCP tools effectively.

### CLI Commands

```bash
# Initialize in a project
aws-deploy init

# Start MCP server
aws-deploy start [--port 3456] [--mode local|saas]

# Deploy directly
aws-deploy deploy [--name myapp] [--branch main] [--region us-east-1]

# Check all prerequisites and project readiness
aws-deploy check [--path /path/to/project]

# Validate project structure only
aws-deploy validate [--path /path/to/project]

# Check deployment status
aws-deploy status --app <appId>

# Run setup wizard
aws-deploy setup
```

## How It Works

1. **Project Detection**: Automatically detects your framework (React, Next.js, Vue, etc.)
2. **Config Generation**: Creates optimized `amplify.yml` build configuration
3. **GitHub Integration**: Ensures your code is in a GitHub repository
4. **AWS Amplify**: Creates and configures an Amplify app
5. **Deployment**: Triggers build and deployment
6. **Monitoring**: Tracks deployment progress and returns your live URL

## Configuration

### AWS Credentials

The tool supports multiple ways to provide AWS credentials, in order of priority:

#### 1. Environment Variables (Recommended)

Set these environment variables in your shell:

```bash
export AWS_ACCESS_KEY_ID="your-access-key-id"
export AWS_SECRET_ACCESS_KEY="your-secret-access-key"
export AWS_REGION="us-east-1"  # Optional, defaults to us-east-1

# For temporary credentials (STS/SSO)
export AWS_SESSION_TOKEN="your-session-token"
```

#### 2. MCP Server Configuration (For Cursor Users)

Add credentials to your `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "amplify-deploy": {
      "command": "node",
      "args": ["/path/to/amplify-deploy.js", "start", "--stdio"],
      "env": {
        "AWS_ACCESS_KEY_ID": "your-access-key-id",
        "AWS_SECRET_ACCESS_KEY": "your-secret-access-key",
        "AWS_REGION": "us-east-1",
        "GITHUB_TOKEN": "your-github-personal-access-token"
      }
    }
  }
}
```

#### 3. AWS CLI Profile

```bash
aws configure
```

### GitHub Setup (AWS Amplify GitHub App)

AWS Amplify now requires the GitHub App approach for new deployments. This is a 2-step process:

#### Step 1: Choose Your AWS Region
First, decide which AWS region you'll deploy to:
- **US East (N. Virginia)**: `us-east-1` ⭐ **(recommended if unsure)**
- **US West (Oregon)**: `us-west-2`
- **EU (Ireland)**: `eu-west-1`  
- **EU (Frankfurt)**: `eu-central-1`
- **Asia Pacific (Sydney)**: `ap-southeast-2`
- **Asia Pacific (Tokyo)**: `ap-northeast-1`

#### Step 2: Install AWS Amplify GitHub App for Your Region
The GitHub App installation is region-specific. Use the URL for your chosen region:

| Region | GitHub App Installation URL |
|--------|----------------------------|
| us-east-1 | https://github.com/apps/aws-amplify-us-east-1/installations/new |
| us-west-2 | https://github.com/apps/aws-amplify-us-west-2/installations/new |
| eu-west-1 | https://github.com/apps/aws-amplify-eu-west-1/installations/new |
| eu-central-1 | https://github.com/apps/aws-amplify-eu-central-1/installations/new |
| ap-southeast-2 | https://github.com/apps/aws-amplify-ap-southeast-2/installations/new |
| ap-northeast-1 | https://github.com/apps/aws-amplify-ap-northeast-1/installations/new |

**Installation steps:**
1. **Open the URL** for your chosen region
2. **Select repositories** you want to deploy (or "All repositories")
3. **Click "Install"**

#### Step 3: Create Personal Access Token
1. **Create Token**: Go to [GitHub Settings > Tokens](https://github.com/settings/tokens/new)
2. **Token Type**: Select "Tokens (classic)" - NOT fine-grained tokens
3. **Description**: "AWS Amplify Deploy Access"  
4. **Scopes**: Select `admin:repo_hook` (Repository webhook and hook administration)
5. **Generate**: Click "Generate token" and copy it

**Add to MCP Configuration:**
```json
"env": {
  "GITHUB_TOKEN": "your-github-token-here"
}
```

**Or set as environment variable:**
```bash
export GITHUB_TOKEN="your-github-token-here"
```

**Requirements:**
- ✅ GitHub App installed for your AWS region
- ✅ Classic token (starts with `ghp_`)
- ✅ `admin:repo_hook` scope (not `repo`)
- ❌ Fine-grained tokens will NOT work

### Getting AWS Credentials

1. **Go to AWS Console** → IAM → Users → Your User → Security credentials
2. **Click "Create access key"**
3. **Copy the Access Key ID and Secret Access Key**
4. **Set environment variables or configure AWS CLI**

For better security, consider using:
- **AWS SSO** for temporary credentials
- **AWS STS** for assume role scenarios
- **IAM roles** for EC2/container deployments

### amplify.yml

The tool automatically generates an `amplify.yml` file based on your project type. You can customize it:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: build
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

### Project Configuration

Create `.amplify-deploy.json` in your project root:

```json
{
  "appName": "my-custom-app-name",
  "region": "eu-west-1",
  "branch": "production"
}
```

## Deployment Modes

### Local Mode (Default)

- Uses your AWS credentials
- Deploys to your AWS account
- Full control over resources
- No external dependencies

### SaaS Mode (Coming Soon)

- No AWS account needed
- Managed deployments
- Simplified authentication
- Usage-based pricing

## Security

- GitHub tokens are stored in system keychain (via keytar)
- AWS credentials use standard AWS CLI configuration
- No credentials are sent to external services in local mode
- All communications are encrypted

## Troubleshooting

### Common Issues

1. **"AWS credentials not found"**
   ```bash
   aws configure
   ```

2. **"Git repository not initialized"**
   ```bash
   git init
   git remote add origin https://github.com/username/repo.git
   ```

3. **"No amplify.yml found"**
   - Run `amplify-deploy init` or let the tool auto-generate one

4. **"GitHub authentication failed"**
   - Ensure your token has `repo` scope
   - Try creating a new token via setup wizard
   - Run comprehensive check: `amplify-deploy check`

5. **"Unable to determine project directory" or "Looking at root directory (/)"**
   
   When using Cursor, the MCP server might not detect your project directory correctly. Solutions:
   
   **Method 1: Open project folder in Cursor**
   ```bash
   # Make sure you open your project folder, not individual files
   cursor /path/to/your/project
   ```
   
   **Method 2: Set environment variable**
   ```bash
   export AMPLIFY_PROJECT_PATH="/path/to/your/project"
   # Then restart Cursor
   ```
   
   **Method 3: Specify path in the request**
   ```
   Deploy my project to AWS Amplify using project_path="/path/to/my/project"
   ```

### Debug Mode

```bash
# Run with debug logging
DEBUG=aws-deploy:* aws-deploy start
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Cursor IDE    │────▶│   MCP Server    │────▶│   AWS Amplify   │
│                 │     │  (Local Node)   │     │                 │
│ • User writes   │     │ • Handles MCP   │     │ • Builds app    │
│   "deploy this" │     │   protocol      │     │ • Hosts app     │
│ • AI triggers   │     │ • Runs deploy   │     │ • Provides URL  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │     GitHub      │
                        │                 │
                        │ • Stores code   │
                        │ • Provides repo │
                        │   integration   │
                        └─────────────────┘
```

## API Reference

### MCP Tools

The MCP server exposes these tools to the IDE:

#### deploy_to_amplify
Deploys the current project to AWS Amplify.

**Parameters:**
- `project_name` (string, optional): Name for the Amplify app
- `branch` (string, default: "main"): Git branch to deploy
- `region` (string, default: "us-east-1"): AWS region

**Returns:** Deployment URL and app ID

#### check_deployment_status
Checks the status of an Amplify deployment.

**Parameters:**
- `app_id` (string, required): Amplify app ID

**Returns:** Deployment status and details

#### generate_amplify_config
Generates an amplify.yml configuration file.

**Parameters:**
- `framework` (string): One of: react, nextjs, vue, angular, static

**Returns:** Generated configuration

#### check_prerequisites
Checks if all required tools are installed.

**Returns:** List of prerequisites and their status

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/rachcorp/aws-deploy-mcp.git
cd aws-deploy-mcp

# Install dependencies
npm install

# Run tests
npm test

# Start in development mode
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test
npm test -- --testNamePattern="deployment"
```

## Roadmap

- [x] Local deployment mode
- [x] MCP server implementation
- [x] Auto-detection of frameworks
- [x] GitHub OAuth integration
- [x] Environment variables management
- [ ] Custom domain support
- [ ] Multi-branch deployments
- [ ] Deployment rollbacks
- [ ] SaaS deployment mode
- [ ] Team collaboration features

## Support

- 🐛 Issues: [GitHub Issues](https://github.com/rachcorp/aws-deploy-mcp/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/rachcorp/aws-deploy-mcp/discussions)
- 📚 Documentation: Check the README and inline code documentation

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
- Powered by [AWS Amplify](https://aws.amazon.com/amplify/)
- Integrates with [Cursor IDE](https://cursor.sh)

---

**Star ⭐ this repo if you find it useful!**

