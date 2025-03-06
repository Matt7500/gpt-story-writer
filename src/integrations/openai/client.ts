import OpenAI from 'openai';

// Helper function to check if an API key is valid
export const isValidApiKey = (apiKey: string | null | undefined): boolean => {
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
};

// Helper function to create a client with a specific API key
export const createOpenAIClient = (apiKey: string) => {
  if (!isValidApiKey(apiKey)) {
    throw new Error('Invalid OpenAI API key');
  }
  
  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true // Required for browser usage
  });
}; 