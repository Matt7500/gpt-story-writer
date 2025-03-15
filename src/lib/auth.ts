import { supabase } from "@/integrations/supabase/client";

export const storeSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    localStorage.setItem('sb-token', session.access_token);
  }
  return session;
};

export const clearSession = () => {
  localStorage.removeItem('sb-token');
};

// Setup auth state change listener
supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.access_token) {
    localStorage.setItem('sb-token', session.access_token);
  } else {
    clearSession();
  }
});

// Helper function to create a new user
export const createUser = async (email: string, password: string) => {
  try {
    // Basic signup with no additional options
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error) {
    console.error("Error creating user:", error);
    return { data: null, error };
  }
};

// Helper function to sign in a user
export const signInUser = async (email: string, password: string) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) throw error;
    
    return { data, error: null };
  } catch (error) {
    console.error("Error signing in user:", error);
    return { data: null, error };
  }
}; 