import OpenAI from 'openai';

// Helper function to check if an API key is valid
export const isValidApiKey = (apiKey: string | null | undefined): boolean => {
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
};

// Helper function to create a client with a specific API key
export const createOpenRouterClient = (apiKey: string) => {
  if (!isValidApiKey(apiKey)) {
    throw new Error('Invalid OpenRouter API key');
  }
  
  return new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    dangerouslyAllowBrowser: true // Required for browser usage
  });
}; 