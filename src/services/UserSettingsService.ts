import { supabase } from "@/integrations/supabase/client";
import type { UserSettings } from "@/types/settings";

interface CachedSettings {
  settings: UserSettings;
  timestamp: number;
}

export class UserSettingsService {
  private static instance: UserSettingsService;
  private cache: Map<string, CachedSettings>;
  private TTL = 1000 * 60 * 5; // Reduced from 15 minutes to 5 minutes
  private defaultSettings: Partial<UserSettings> = {
    openrouter_model: "openai/gpt-4o-mini",
    reasoning_model: "anthropic/claude-3-haiku-20240307",
    elevenlabs_model: "eleven_multilingual_v2",
    rewrite_model: "gpt-4",
    story_generation_model: "openai/gpt-4o-mini",
    use_openai_for_story_gen: false,
    title_fine_tune_model: "gpt-4o",
    story_idea_model: "gpt-4o"
  };

  private constructor() {
    this.cache = new Map();
  }

  public static getInstance(): UserSettingsService {
    if (!UserSettingsService.instance) {
      UserSettingsService.instance = new UserSettingsService();
    }
    return UserSettingsService.instance;
  }

  private isCacheValid(userId: string): boolean {
    const cached = this.cache.get(userId);
    if (!cached) return false;
    return Date.now() - cached.timestamp < this.TTL;
  }

  public async getSettings(userId: string): Promise<UserSettings> {
    // Check cache first
    if (this.isCacheValid(userId)) {
      console.log('Using cached settings for user:', userId);
      return this.cache.get(userId)!.settings;
    }

    console.log('Loading settings from database for user:', userId);
    try {
      // Load from database
      const { data: settingsData, error: settingsError } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (settingsError) {
        if (settingsError.code === "PGRST116") {
          // Settings don't exist, create them
          return await this.createDefaultSettings(userId);
        }
        throw settingsError;
      }

      if (settingsData) {
        // Ensure all required fields are present
        const completeSettings: UserSettings = {
          ...this.defaultSettings,
          ...settingsData,
          user_id: userId
        } as UserSettings;

        // Update cache
        this.cache.set(userId, {
          settings: completeSettings,
          timestamp: Date.now()
        });
        
        console.log('Settings loaded and cached for user:', userId);
        return completeSettings;
      }

      // If no settings found, create default
      return await this.createDefaultSettings(userId);
    } catch (error) {
      console.error("Error fetching user settings:", error);
      throw error;
    }
  }

  private async createDefaultSettings(userId: string): Promise<UserSettings> {
    const defaultUserSettings = {
      user_id: userId,
      ...this.defaultSettings
    } as UserSettings;

    const { data: newSettings, error: insertError } = await supabase
      .from("user_settings")
      .insert([defaultUserSettings])
      .select()
      .single();

    if (insertError) throw insertError;

    // Ensure all required fields are present
    const completeSettings: UserSettings = {
      ...defaultUserSettings,
      ...newSettings
    };

    // Update cache with new settings
    this.cache.set(userId, {
      settings: completeSettings,
      timestamp: Date.now()
    });

    return completeSettings;
  }

  public async updateSettings(userId: string, settings: Partial<UserSettings>): Promise<UserSettings> {
    try {
      console.log('Updating settings for user:', userId, 'with:', settings);
      const { data: updatedSettings, error } = await supabase
        .from("user_settings")
        .update(settings)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;

      // Ensure all required fields are present
      const completeSettings: UserSettings = {
        ...this.defaultSettings,
        ...updatedSettings,
        user_id: userId
      } as UserSettings;

      // Update cache
      this.cache.set(userId, {
        settings: completeSettings,
        timestamp: Date.now()
      });

      console.log('Settings updated and cached for user:', userId);
      return completeSettings;
    } catch (error) {
      console.error("Error updating user settings:", error);
      throw error;
    }
  }

  public clearCache(userId?: string) {
    if (userId) {
      console.log('Clearing cache for user:', userId);
      this.cache.delete(userId);
    } else {
      console.log('Clearing entire settings cache');
      this.cache.clear();
    }
  }
}

// Export a singleton instance
export const userSettingsService = UserSettingsService.getInstance(); 