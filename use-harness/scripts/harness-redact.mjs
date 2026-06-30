export function redactSecrets(text) {
  return String(text)
    .replace(
      /(OPENAI_API_KEY|CODEX_API_KEY|ANTHROPIC_API_KEY|AI_GATEWAY_API_KEY|XAI_API_KEY|FACTORY_API_KEY|OPENCODE_API_KEY|TOKEN|PASSWORD|password)=([^\s]+)/g,
      '$1=[REDACTED]',
    )
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, 'sk-[REDACTED]');
}