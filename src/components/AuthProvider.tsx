import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Session, User } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
}

const AuthContext = createContext<AuthContextType>({ user: null, session: null });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Function to ensure user settings exist
  const ensureUserSettings = async (userId: string) => {
    try {
      // Check if user settings already exist
      const { data: existingSettings } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", userId)
        .single();

      // If settings don't exist, create default settings
      if (!existingSettings) {
        console.log("Creating default user settings for new user:", userId);
        
        const defaultSettings = {
          user_id: userId,
          openrouter_model: "openai/gpt-4o-mini",
          reasoning_model: "anthropic/claude-3-haiku-20240307",
          elevenlabs_model: "eleven_multilingual_v2",
          rewrite_model: "gpt-4",
          story_generation_model: "openai/gpt-4o-mini",
          use_openai_for_story_gen: false,
          title_fine_tune_model: "gpt-4o",
          story_idea_model: "gpt-4o"
        };
        
        const { error } = await supabase
          .from("user_settings")
          .insert([defaultSettings]);
          
        if (error) {
          console.error("Error creating default user settings:", error);
        } else {
          console.log("Default user settings created successfully");
        }
      }
    } catch (error) {
      console.error("Error ensuring user settings:", error);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      // Ensure user settings exist if user is logged in
      if (session?.user) {
        ensureUserSettings(session.user.id);
      }
      
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      // Ensure user settings exist when auth state changes
      if (session?.user) {
        ensureUserSettings(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <AuthContext.Provider value={{ user, session }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  return useContext(AuthContext);
};
