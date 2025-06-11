# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of AWS Deploy MCP seriously. If you discover a security vulnerability, please follow these steps:

### Preferred Method: Private Security Advisory

1. Go to the [Security tab](https://github.com/aws-deploy/aws-deploy-mcp/security) of our GitHub repository
2. Click "Report a vulnerability"
3. Fill out the security advisory form with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if you have one)

### Alternative: Email

If you prefer email or the GitHub advisory system is not available:

- **Do not** create a public GitHub issue
- Email details to the maintainers (create a GitHub issue asking for a security contact email)
- Include "SECURITY" in the subject line

## What to Include

When reporting a security vulnerability, please include:

- **Type of vulnerability** (e.g., SQL injection, cross-site scripting, etc.)
- **Full paths** of source file(s) related to the vulnerability
- **Location** of the affected source code (tag/branch/commit or direct URL)
- **Special configuration** required to reproduce the issue
- **Step-by-step instructions** to reproduce the issue
- **Proof-of-concept or exploit code** (if possible)
- **Impact** of the issue, including how an attacker might exploit it

## Response Timeline

- **Initial Response**: Within 48 hours of report
- **Status Update**: Within 1 week with preliminary assessment
- **Resolution**: Timeline depends on complexity, but we aim for:
  - Critical issues: 7 days
  - High issues: 14 days
  - Medium/Low issues: 30 days

## Security Considerations

### AWS Credentials

- Never commit AWS credentials to the repository
- Use environment variables or AWS credential files
- Follow AWS security best practices
- Regularly rotate access keys

### GitHub Tokens

- Use minimal required scopes
- Store tokens securely using system keychain
- Never log or display tokens in plaintext

### MCP Protocol

- Validate all input from MCP clients
- Sanitize file paths to prevent directory traversal
- Implement proper error handling without information disclosure

### Dependencies

- Regularly update dependencies to patch known vulnerabilities
- Use `npm audit` to check for security issues
- Pin dependency versions to avoid supply chain attacks

## Security Features

This project implements several security measures:

- **Input validation** on all user-provided data
- **Path sanitization** to prevent directory traversal attacks
- **Secure credential storage** using system keychain
- **Encrypted communication** for all external API calls
- **Minimal permissions** principle for AWS and GitHub access

## Bug Bounty Program

Currently, we do not have a formal bug bounty program. However, we greatly appreciate security researchers who responsibly disclose vulnerabilities and will:

- Publicly acknowledge your contribution (with your permission)
- Provide a detailed security advisory crediting your discovery
- Work with you on a reasonable timeline for disclosure

## Scope

### In Scope

- Authentication and authorization issues
- Data validation vulnerabilities
- Injection attacks (command injection, etc.)
- Information disclosure
- Denial of service attacks
- Privilege escalation

### Out of Scope

- Social engineering attacks
- Physical attacks
- Issues in third-party dependencies (please report to the respective projects)
- Brute force attacks on credentials
- Issues requiring physical access to the machine

## Safe Harbor

We support safe harbor for security researchers who:

- Make a good faith effort to avoid privacy violations and disruption
- Only interact with accounts you own or with permission of the account holder
- Do not access, modify, or delete data belonging to others
- Report vulnerabilities as soon as possible after discovery
- Wait for our response before disclosing publicly

## Questions?

If you have questions about this security policy or need clarification, please create a GitHub issue with the "security" label.

Thank you for helping keep AWS Deploy MCP secure! 🔒 