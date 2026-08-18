const CLAUDE_OAUTH_EXCLUDED_ENVIRONMENT_KEYS = ["ANTHROPIC_API_KEY"] as const;

/**
 * Token Monitor checks Claude subscription quota through the Claude.ai OAuth
 * flow only. Do not inherit API-key authentication into child CLI processes.
 */
export function createClaudeOAuthEnvironment(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const environment = { ...base };

  for (const key of Object.keys(environment)) {
    if (CLAUDE_OAUTH_EXCLUDED_ENVIRONMENT_KEYS.some((excludedKey) => key.toUpperCase() === excludedKey)) {
      delete environment[key];
    }
  }

  return environment;
}

/** Windows cmd statements used by the visible Claude login launcher. */
export function getClaudeOAuthEnvironmentResetCommands() {
  return CLAUDE_OAUTH_EXCLUDED_ENVIRONMENT_KEYS.map((key) => `set "${key}="`);
}
