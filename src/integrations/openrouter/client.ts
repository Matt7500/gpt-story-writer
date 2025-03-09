import OpenAI from 'openai';

// Helper function to check if an API key is valid
export const isValidApiKey = (apiKey: string | null | undefined): boolean => {
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
};

// Helper function to create a client with a specific API key
export const createOpenRouterClient = (apiKey: string) => {
  console.log('Creating OpenRouter client...');
  
  if (!isValidApiKey(apiKey)) {
    console.error('Invalid OpenRouter API key');
    throw new Error('Invalid OpenRouter API key');
  }
  
  try {
    console.log('OpenRouter API key is valid, creating client...');
    const client = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      dangerouslyAllowBrowser: true // Required for browser usage
    });
    console.log('OpenRouter client created successfully');
    return client;
  } catch (error) {
    console.error('Error creating OpenRouter client:', error);
    throw error;
  }
}; 