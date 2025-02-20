const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

class UserSettingsService {
  constructor() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('Missing required Supabase environment variables');
    }

    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    this.cache = new Map();
    this.TTL = 1000 * 60 * 15; // 15 minutes
    this.defaultSettings = {
      openrouter_model: "gpt-4o-mini",
      reasoning_model: "llama-3.1-sonar-small-128k-online",
      elevenlabs_model: "eleven_multilingual_v2",
      title_fine_tune_model: "gpt-4",
      rewriting_model: "gpt-4"
    };
  }

  isCacheValid(userId) {
    const cached = this.cache.get(userId);
    if (!cached) return false;
    return Date.now() - cached.timestamp < this.TTL;
  }

  async getSettings(userId) {
    // Check cache first
    if (this.isCacheValid(userId)) {
      return this.cache.get(userId).settings;
    }

    try {
      // Load from database
      const { data: settingsData, error: settingsError } = await this.supabase
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
          settings: settingsData,
          timestamp: Date.now()
        });
        return settingsData;
      }

      // If no settings found, create default
      return await this.createDefaultSettings(userId);
    } catch (error) {
      console.error("Error fetching user settings:", error);
      throw error;
    }
  }

  async createDefaultSettings(userId) {
    const defaultUserSettings = {
      user_id: userId,
      ...this.defaultSettings
    };

    const { data: newSettings, error: insertError } = await this.supabase
      .from("user_settings")
      .insert([defaultUserSettings])
      .select()
      .single();

    if (insertError) throw insertError;

    // Update cache with new settings
    this.cache.set(userId, {
      settings: newSettings,
      timestamp: Date.now()
    });

    return newSettings;
  }

  async updateSettings(userId, settings) {
    try {
      const { data: updatedSettings, error } = await this.supabase
        .from("user_settings")
        .update(settings)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;

      // Update cache with new settings
      this.cache.set(userId, {
        settings: updatedSettings,
        timestamp: Date.now()
      });

      return updatedSettings;
    } catch (error) {
      console.error("Error updating user settings:", error);
      throw error;
    }
  }

  clearCache(userId) {
    if (userId) {
      this.cache.delete(userId);
    } else {
      this.cache.clear();
    }
  }
}

// Export a singleton instance
module.exports = new UserSettingsService(); 