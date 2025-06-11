const { AmplifyClient, UpdateAppCommand, ListAppsCommand, GetAppCommand } = require('@aws-sdk/client-amplify');
const fs = require('fs');
const path = require('path');

class AmplifyEnvManager {
    constructor(region = 'us-east-1') {
        this.region = region;
        this.amplifyClient = new AmplifyClient({ region });
    }

    /**
     * Parse .env file to get environment variables
     */
    parseEnvFile(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Environment file not found: ${filePath}`);
        }
        
        const content = fs.readFileSync(filePath, 'utf8');
        const envVars = {};
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const [key, ...valueParts] = trimmed.split('=');
                if (key && valueParts.length > 0) {
                    let value = valueParts.join('=');
                    // Remove quotes if present
                    if ((value.startsWith('"') && value.endsWith('"')) || 
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    envVars[key.trim()] = value;
                }
            }
        }
        
        return envVars;
    }

    /**
     * Sync environment variables to Amplify app
     */
    async syncToAmplify(appId, envVars) {
        try {
            const command = new UpdateAppCommand({
                appId,
                environmentVariables: envVars
            });
            
            await this.amplifyClient.send(command);
            return { success: true, count: Object.keys(envVars).length };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Automatic workflow: Read .env file, filter, and sync directly to Amplify
     */
    async autoSyncFromEnvFile(projectPath, appId, projectName) {
        const results = {
            envFileRead: false,
            envVarsFound: 0,
            synced: false,
            errors: []
        };

        try {
            // Look for .env files
            const envFiles = ['.env', '.env.local', '.env.production'];
            let envVars = {};
            let foundEnvFile = false;

            for (const envFile of envFiles) {
                const envPath = path.join(projectPath, envFile);
                if (fs.existsSync(envPath)) {
                    try {
                        const fileVars = this.parseEnvFile(envPath);
                        envVars = { ...envVars, ...fileVars };
                        foundEnvFile = true;
                        results.envFileRead = true;
                    } catch (error) {
                        results.errors.push(`Error reading ${envFile}: ${error.message}`);
                    }
                }
            }

            if (!foundEnvFile) {
                results.errors.push('No .env files found in project directory');
                return results;
            }

            // Filter out common local/development variables that shouldn't go to production
            const filteredVars = this.filterProductionVars(envVars);
            results.envVarsFound = Object.keys(filteredVars).length;

            if (Object.keys(filteredVars).length === 0) {
                results.errors.push('No production-suitable environment variables found');
                return results;
            }

            // Sync directly to Amplify
            const syncResult = await this.syncToAmplify(appId, filteredVars);
            results.synced = syncResult.success;
            
            if (!syncResult.success) {
                results.errors.push(`Amplify sync failed: ${syncResult.error}`);
            }

        } catch (error) {
            results.errors.push(`Auto-sync failed: ${error.message}`);
        }

        return results;
    }

    /**
     * Filter environment variables suitable for production
     */
    filterProductionVars(envVars) {
        const excludePatterns = [
            /^NODE_ENV$/i,
            /^PORT$/i,
            /^HOST$/i,
            /^LOCAL/i,
            /^DEV/i,
            /^DEBUG/i,
            /localhost/i,
            /127\.0\.0\.1/,
            /^REACT_APP_API_URL.*localhost/i
        ];

        const filtered = {};
        
        for (const [key, value] of Object.entries(envVars)) {
            const shouldExclude = excludePatterns.some(pattern => 
                pattern.test(key) || pattern.test(value)
            );
            
            if (!shouldExclude && value.trim() !== '') {
                filtered[key] = value;
            }
        }
        
        return filtered;
    }

    /**
     * Mask sensitive values for display (show first 4 and last 4 characters)
     */
    maskValue(value) {
        if (!value || value.length <= 8) {
            return '****';
        }
        return value.substring(0, 4) + '****' + value.substring(value.length - 4);
    }

    /**
     * Get environment variables from Amplify app
     */
    async getAmplifyAppEnvVars(appId) {
        try {
            const command = new GetAppCommand({ appId });
            const response = await this.amplifyClient.send(command);
            
            return {
                success: true,
                envVars: response.app.environmentVariables || {},
                appName: response.app.name
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                envVars: {}
            };
        }
    }

    /**
     * List all Amplify apps with their environment variables
     */
    async listAmplifyAppsWithEnvVars() {
        try {
            const command = new ListAppsCommand({});
            const response = await this.amplifyClient.send(command);
            
            const appsWithEnvVars = [];
            
            for (const app of response.apps || []) {
                if (app.environmentVariables && Object.keys(app.environmentVariables).length > 0) {
                    appsWithEnvVars.push({
                        appId: app.appId,
                        name: app.name,
                        envVarCount: Object.keys(app.environmentVariables).length,
                        envVars: app.environmentVariables
                    });
                }
            }
            
            return { success: true, apps: appsWithEnvVars };
        } catch (error) {
            return { success: false, error: error.message, apps: [] };
        }
    }

    /**
     * Get project names from deployment history
     */
    async listProjectsFromDeploymentHistory() {
        const historyPath = path.join(process.cwd(), '.amplify-deploy-history.json');
        
        if (!fs.existsSync(historyPath)) {
            return [];
        }
        
        try {
            const historyData = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
            const uniqueProjects = [...new Set(historyData.deployments?.map(d => d.projectName) || [])];
            
            return uniqueProjects.map(name => ({
                projectName: name,
                source: 'deployment_history'
            }));
        } catch (error) {
            return [];
        }
    }

    /**
     * Helper to format environment variables for display
     */
    formatEnvVarsForDisplay(envVars, maskValues = true) {
        const formatted = [];
        
        for (const [key, value] of Object.entries(envVars)) {
            formatted.push({
                key,
                value: maskValues ? this.maskValue(value) : value,
                type: this.inferVarType(key, value)
            });
        }
        
        return formatted.sort((a, b) => a.key.localeCompare(b.key));
    }

    /**
     * Infer the type/service of an environment variable
     */
    inferVarType(key, value) {
        const keyLower = key.toLowerCase();
        const valueLower = value.toLowerCase();
        
        if (keyLower.includes('supabase')) return 'Supabase';
        if (keyLower.includes('firebase')) return 'Firebase';
        if (keyLower.includes('stripe')) return 'Stripe';
        if (keyLower.includes('google') || keyLower.includes('youtube')) return 'Google';
        if (keyLower.includes('sendgrid') || keyLower.includes('email')) return 'SendGrid';
        if (keyLower.includes('twilio')) return 'Twilio';
        if (keyLower.includes('auth0')) return 'Auth0';
        if (keyLower.includes('api') && keyLower.includes('url')) return 'API URL';
        if (keyLower.includes('key') || keyLower.includes('secret')) return 'API Key';
        if (keyLower.includes('token')) return 'Token';
        if (keyLower.includes('database') || keyLower.includes('db')) return 'Database';
        if (keyLower.includes('redis')) return 'Redis';
        if (keyLower.includes('mongodb')) return 'MongoDB';
        if (valueLower.includes('amazonaws.com')) return 'AWS';
        
        return 'General';
    }
}

module.exports = { AmplifyEnvManager }; 