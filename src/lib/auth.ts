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