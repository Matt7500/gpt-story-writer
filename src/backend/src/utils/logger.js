const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logsDir = path.join(__dirname, '../logs');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  getCurrentLogFile() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logsDir, `api_logs_${date}.log`);
  }

  formatLogEntry(type, data) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      type,
      ...data
    };
    return JSON.stringify(logEntry, null, 2);
  }

  async log(type, data) {
    try {
      const logFile = this.getCurrentLogFile();
      const logEntry = this.formatLogEntry(type, data);
      
      await fs.promises.appendFile(logFile, logEntry + '\n---\n');
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }

  async logStoryGeneration(userId, data) {
    await this.log('story_generation', {
      userId,
      ...data
    });
  }

  async logSceneWriting(userId, data) {
    await this.log('scene_writing', {
      userId,
      ...data
    });
  }

  async logSceneFeedback(userId, data) {
    await this.log('scene_feedback', {
      userId,
      ...data
    });
  }

  async logError(userId, error) {
    await this.log('error', {
      userId,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    });
  }
}

module.exports = new Logger(); 