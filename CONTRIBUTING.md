# Contributing to Amplify Deploy MCP

Thank you for your interest in contributing to Amplify Deploy MCP! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Guidelines](#contributing-guidelines)
- [Pull Request process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Code Style](#code-style)
- [Testing](#testing)

## Code of Conduct

This project adheres to a code of conduct that we expect all contributors to follow. Please be respectful, inclusive, and constructive in all interactions.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Create a feature branch from `main`
4. Make your changes
5. Test your changes
6. Submit a pull request

## Development Setup

### Prerequisites

- Node.js 16+ 
- npm or yarn
- Git
- AWS CLI (for testing)
- GitHub account

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/aws-deploy-mcp.git
cd aws-deploy-mcp

# Install dependencies
npm install

# Run tests to verify setup
npm test
```

### Running the Development Server

```bash
# Start the MCP server in development mode
npm run start

# Or run directly
node bin/amplify-deploy.js start --port 3456
```

## Contributing Guidelines

### What We're Looking For

- 🐛 **Bug fixes**: Help us fix issues and improve reliability
- ✨ **Features**: New functionality that aligns with the project goals
- 📚 **Documentation**: Improvements to README, code comments, or guides
- 🧪 **Tests**: Adding or improving test coverage
- 🎨 **UI/UX**: Better user experience and interface improvements
- 🔧 **Tooling**: Development and build process improvements

### What We're NOT Looking For

- Breaking changes without discussion
- Features that significantly increase complexity without clear benefit
- Changes that don't align with the MCP (Model Context Protocol) philosophy
- Untested code

## Pull Request Process

1. **Create an Issue First**: For significant changes, create an issue to discuss the approach
2. **Fork & Branch**: Create a feature branch from `main`
3. **Small Commits**: Make focused commits with clear messages
4. **Test Your Changes**: Ensure all tests pass and add new tests if needed
5. **Update Documentation**: Update README or code comments as needed
6. **Submit PR**: Create a pull request with a clear description

### PR Description Template

```markdown
## Description
Brief description of what this PR does.

## Changes Made
- List specific changes
- Use bullet points
- Be specific

## Testing
- [ ] All existing tests pass
- [ ] Added new tests for new functionality
- [ ] Manually tested the changes

## Related Issues
Fixes #123, Related to #456
```

## Issue Reporting

### Bug Reports

When reporting bugs, please include:

- **Environment**: Node.js version, OS, AWS region
- **Steps to Reproduce**: Exact steps that cause the issue
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Error Messages**: Full error messages and stack traces
- **Configuration**: Relevant configuration (remove sensitive data)

### Feature Requests

For feature requests, please include:

- **Use Case**: Why is this feature needed?
- **Proposed Solution**: How should it work?
- **Alternatives**: What alternatives have you considered?
- **Additional Context**: Any other relevant information

## Code Style

### JavaScript Style

- Use ES6+ features where appropriate
- Follow existing code patterns
- Use meaningful variable and function names
- Add JSDoc comments for public functions
- Keep functions small and focused

### Example

```javascript
/**
 * Deploys a project to AWS Amplify
 * @param {Object} options - Deployment options
 * @param {string} options.projectPath - Path to the project
 * @param {string} options.appName - Name for the Amplify app
 * @returns {Promise<Object>} Deployment result with URL and app ID
 */
async function deployToAmplify(options) {
  // Implementation here
}
```

### File Organization

- Keep related functionality together
- Use descriptive file names
- Add module-level comments explaining the purpose
- Export functions clearly

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- src/test/deployment.test.js

# Run tests in watch mode
npm run test:watch
```

### Writing Tests

- Write tests for new functionality
- Test both success and error cases
- Use descriptive test names
- Mock external dependencies (AWS, GitHub)
- Keep tests focused and independent

### Example Test

```javascript
describe('deployToAmplify', () => {
  it('should deploy a React project successfully', async () => {
    // Setup
    const mockOptions = {
      projectPath: '/path/to/react/project',
      appName: 'test-app'
    };

    // Test
    const result = await deployToAmplify(mockOptions);

    // Assert
    expect(result.url).toMatch(/https:\/\/.*\.amplifyapp\.com/);
    expect(result.appId).toBeTruthy();
  });
});
```

## Development Tips

### Debugging

```bash
# Enable debug logging
DEBUG=aws-deploy:* npm start

# Run with verbose logging
node bin/amplify-deploy.js start --verbose
```

### Testing with Real AWS

1. Create a dedicated AWS account for testing
2. Use environment variables for credentials
3. Clean up resources after testing
4. Never commit real credentials

### MCP Protocol Integration

- Follow MCP specifications
- Test with Cursor IDE
- Ensure tools are properly exposed
- Handle errors gracefully

## Release Process

Releases are handled by maintainers:

1. Version bump following semantic versioning
2. Update CHANGELOG.md
3. Create GitHub release
4. Publish to npm

## Getting Help

- 💬 [GitHub Discussions](https://github.com/amplify-deploy/amplify-deploy-mcp/discussions)
- 🐛 [GitHub Issues](https://github.com/amplify-deploy/amplify-deploy-mcp/issues)
- 📖 Check existing documentation and README

## Recognition

Contributors will be acknowledged in:
- CONTRIBUTORS.md file
- GitHub releases
- Package.json contributors field

Thank you for contributing to Amplify Deploy MCP! 