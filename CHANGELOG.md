# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.2] - 2024-12-19

### Changed
- Updated package name to scoped npm package `@cloudagent/aws-deploy`
- Improved build and publish configuration with npm scoped packages
- Enhanced GitHub Actions workflow for automated releases
- Added .npmignore for cleaner npm packages
- Updated Node.js requirement to 18+ (removed Node.js 16 support)

### Fixed
- Updated all documentation to use new scoped package name
- Fixed test expectations for new package name and version
- Updated ESLint to version 9 with flat config format

## [1.0.1] - 2024-12-19

### Added
- Initial open source release preparation
- Contributing guidelines
- Security policy
- Issue and PR templates
- Comprehensive documentation

### Changed
- Package name from `@your-company/amplify-deploy` to `@cloudagent/aws-deploy`
- Updated repository URLs and contact information
- Improved README with clearer installation and usage instructions

### Fixed
- Missing LICENSE file
- Placeholder company information

## [1.0.0] - 2024-01-XX

### Added
- One-click deployment from GitHub to AWS Amplify
- MCP (Model Context Protocol) server integration
- Support for React, Next.js, Vue, Angular, and static sites
- Automatic framework detection and build configuration
- AWS credentials management
- GitHub OAuth integration
- Environment variables synchronization
- Interactive setup wizard
- CLI commands for deployment and status checking
- Local deployment mode
- Comprehensive error handling and logging

### Features
- 🚀 One-click deployment to AWS Amplify
- 🤖 AI-powered integration with Cursor IDE
- 🔧 Zero-config framework detection
- 🔐 Secure credential management
- 📦 Multi-framework support
- 🌐 Local deployment mode
- ⚡ Environment variables sync

### Security
- Secure credential storage using system keychain
- Input validation and sanitization
- Encrypted communication with external APIs
- Minimal permission principle for AWS and GitHub access 