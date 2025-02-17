
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings as SettingsIcon, User, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [openAIModel, setOpenAIModel] = useState("gpt-4o-mini");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    async function loadSettings() {
      try {
        // Load profile data
        const { data: profileData } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();

        if (profileData) {
          setUsername(profileData.username || "");
        }

        // Load AI settings
        const { data: settingsData } = await supabase
          .from("user_settings")
          .select("openai_model")
          .eq("user_id", user.id)
          .single();

        if (settingsData) {
          setOpenAIModel(settingsData.openai_model);
        } else {
          // Create default settings if none exist
          await supabase
            .from("user_settings")
            .insert([{ user_id: user.id, openai_model: "gpt-4o-mini" }]);
        }
      } catch (error) {
        console.error("Error loading settings:", error);
        toast({
          title: "Error",
          description: "Failed to load settings",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, [user, navigate]);

  const handleSaveProfile = async () => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ username })
        .eq("id", user?.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive",
      });
    }
  };

  const handleSaveAISettings = async () => {
    try {
      const { error } = await supabase
        .from("user_settings")
        .update({ openai_model: openAIModel })
        .eq("user_id", user?.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "AI settings updated successfully",
      });
    } catch (error) {
      console.error("Error updating AI settings:", error);
      toast({
        title: "Error",
        description: "Failed to update AI settings",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="container max-w-2xl mx-auto p-8 space-y-8">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

      {/* Profile Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <User className="h-5 w-5" />
          <h2 className="text-xl font-medium">Profile Settings</h2>
        </div>
        <Separator />
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Username</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
            />
          </div>
          <Button onClick={handleSaveProfile}>Save Profile</Button>
        </div>
      </div>

      {/* AI Settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          <h2 className="text-xl font-medium">AI Settings</h2>
        </div>
        <Separator />
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">OpenAI Model</label>
            <Input
              value={openAIModel}
              onChange={(e) => setOpenAIModel(e.target.value)}
              placeholder="Enter OpenAI model name"
            />
            <p className="text-sm text-muted-foreground">
              Available models: gpt-4o-mini (faster), gpt-4o (more powerful)
            </p>
          </div>
          <Button onClick={handleSaveAISettings}>Save AI Settings</Button>
        </div>
      </div>

      <Button
        variant="outline"
        onClick={() => navigate("/")}
        className="mt-8"
      >
        Back to Stories
      </Button>
    </div>
  );
}
