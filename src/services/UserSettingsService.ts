import { supabase } from "@/integrations/supabase/client";
import type { UserSettings } from "@/types/settings";

interface CachedSettings {
  settings: UserSettings;
  timestamp: number;
}

export class UserSettingsService {
  private static instance: UserSettingsService;
  private cache: Map<string, CachedSettings>;
  private TTL = 1000 * 60 * 15; // 15 minutes
  private defaultSettings: Partial<UserSettings> = {
    openrouter_model: "gpt-4o-mini",
    reasoning_model: "llama-3.1-sonar-small-128k-online",
    elevenlabs_model: "eleven_multilingual_v2",
    rewrite_model: "gpt-4",
    story_generation_model: "gpt-4",
    use_openai_for_story_gen: false
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
      return this.cache.get(userId)!.settings;
    }

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
        // Update cache
        this.cache.set(userId, {
          settings: settingsData as UserSettings,
          timestamp: Date.now()
        });
        return settingsData as UserSettings;
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
    };

    const { data: newSettings, error: insertError } = await supabase
      .from("user_settings")
      .insert([defaultUserSettings])
      .select()
      .single();

    if (insertError) throw insertError;

    // Update cache with new settings
    this.cache.set(userId, {
      settings: newSettings as UserSettings,
      timestamp: Date.now()
    });

    return newSettings as UserSettings;
  }

  public async updateSettings(userId: string, settings: Partial<UserSettings>): Promise<UserSettings> {
    try {
      const { data: updatedSettings, error } = await supabase
        .from("user_settings")
        .update(settings)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;

      // Update cache
      this.cache.set(userId, {
        settings: updatedSettings as UserSettings,
        timestamp: Date.now()
      });

      return updatedSettings as UserSettings;
    } catch (error) {
      console.error("Error updating user settings:", error);
      throw error;
    }
  }

  public clearCache(userId?: string) {
    if (userId) {
      this.cache.delete(userId);
    } else {
      this.cache.clear();
    }
  }
}

// Export a singleton instance
export const userSettingsService = UserSettingsService.getInstance(); 