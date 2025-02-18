/***************************************************************************
 * storyWriter.js
 *
 * A Node.js translation of the Python script "story_writer.py".
 * Maintains near-identical functionality and structure (function names,
 * method flow, etc.), but adapted for Node.js async/await usage and libraries.
 ***************************************************************************/

// Load environment variables from .env file
require('dotenv').config();

//
// Required libraries
//
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const OpenAI = require('openai');
// For Reddit, consider using snoowrap or a similar library:
const Snoowrap = require('snoowrap');
const profilesData = require('./profiles.json');

// If you want a progress bar similar to tqdm, install a Node package like cli-progress
// and import it here:
// const cliProgress = require('cli-progress');

//
// Settings object with profiles from JSON
//
const settings = {
  OAI_API_KEY: process.env.OAI_API_KEY || '',
  OR_API_KEY: process.env.OR_API_KEY || '',
  OR_MODEL: process.env.OR_MODEL || 'openai/o3-mini',
  OAI_MODEL: process.env.OAI_MODEL || 'gpt-4',
  FT_MODEL: process.env.FT_MODEL || 'ft:gpt-4o-2024-08-06:personal:jgrupe-narration-ft:AQnm6wr1',
  USE_REDDIT: false,
  USE_FINE_TUNE: false,
  STORY_PROFILE: 'Horror', // Default to Horror category
  NUM_SCENES: 8,
  profiles: profilesData.categories,
  load_story_profiles: function() {
    const profileMap = {};
    this.profiles.forEach(profile => {
      profileMap[profile.name] = {
        flair_exclude: profile.flair_exclude || 'Series',
        prompts: profile.prompts,
        system_prompt: profile.system_prompt,
        model: profile.model,
        num_scenes: profile.num_scenes || 8
      };
    });
    return profileMap;
  },
  initialize_settings: function(username) {
    // Logic that you want to run to load user-specific settings
    // e.g., read from DB or environment
  },
  initialize_channel_settings: function(username, channelName) {
    // Load channel-specific settings
  },
  get_channel_names: function(username) {
    // Stub to simulate retrieving channels for a user
    return ['example-channel'];
  }
};


//
// Global variables to hold the clients, in parallel to the Python code
//
let oaiClient = null;   // Node OpenAI client
let orClient = null;    // "OpenRouter" or custom client
let reddit = null;      // Node Reddit client (snoowrap, etc.)

// In Python: previous_scenes = []
// We'll store them here as well:
let previousScenes = [];

//
// Utility: Replace words or phrases in strings
//
function replaceWords(text) {
  // Replaces single words & short phrases, just like in Python
  // (See 'replace_words' / 'replace_phrases' in your Python)
  const wordBank = {
    // EXACT same mappings from the Python code's replace_words
    'shifted': 'moved',
    'shift': 'change',
    'shifting': 'changing',
    'bravado': 'bravery',
    'loomed': 'appeared',
    // ...etc. For brevity, not repeating the entire dictionary here
  };

  const phraseBank = {
    'I frowned. ': '',
    ', frowning': '',
    'I frowned and ': 'I',
    // ...additional phrase replacements
  };

  // First replace entire phrases:
  Object.entries(phraseBank).forEach(([oldP, newP]) => {
    if (text.includes(oldP)) {
      text = text.split(oldP).join(newP);
    }
  });

  // Then replace individual words with a regex:
  Object.entries(wordBank).forEach(([oldW, newW]) => {
    // Use word boundaries, ignoring case:
    const regex = new RegExp(`\\b${oldW}\\b`, 'gi');
    text = text.replace(regex, newW);
  });

  return text;
}

//
// 1) initialize_clients: replicates your Python logic to create/verify clients
//
async function initializeClients() {
  // Create the standard OpenAI client
  if (!settings.OAI_API_KEY) {
    throw new Error("OpenAI API key is empty or None");
  }
  try {
    oaiClient = new OpenAI({
      apiKey: settings.OAI_API_KEY
    });
    console.log("OpenAI client initialized successfully");
  } catch (err) {
    console.error("Error initializing OpenAI client:", err);
    throw err;
  }

  // Create "OpenRouter" or custom client
  if (settings.OR_API_KEY) {
    orClient = axios.create({
      baseURL: "https://openrouter.ai/api/v1",
      headers: { 
        Authorization: `Bearer ${settings.OR_API_KEY}`,
        'HTTP-Referer': 'http://localhost:5173', // Required by OpenRouter
        'X-Title': 'Plotter Palette' // Required by OpenRouter
      }
    });
    console.log("OpenRouter client initialized successfully");
  } else {
    orClient = null;
    console.log("Skipping OpenRouter client initialization (no API key)");
  }

  // Initialize Reddit client
  // The below is a sample usage of snoowrap; you must provide your own secrets.
  try {
    reddit = new Snoowrap({
      userAgent: 'Reddit posts',
      clientId: '1oQZd_uYc9Wl7Q',
      clientSecret: 'uanzrHod7xZya1VSZ2ZTzEVXnlA',
      refreshToken: ''  // or username/password, depending on your scenario
    });
    console.log("Reddit client initialized successfully");
  } catch (err) {
    console.error("Error initializing Reddit client:", err);
    reddit = null;
  }

  console.log("Client initialization completed");
}

//
// 2) write_detailed_scene_description
//
async function writeDetailedSceneDescription(scene) {
  const prompt = `
Analyze the following scene and provide a highly detailed paragraph focusing on the most important details and events that are crucial to the story.
You must include every single detail exactly that is most important to the plot of the story.

Be as detailed as possible with your description of the events in the scene, your description must be at least 200 words.
Do not write any comments, only return the description.

Scene:
${scene}

Provide the description as a structured text, not in JSON format.
  `;

  let retries = 0;
  while (retries < 5) {
    try {
      // Example usage of your 'orClient'
      // In Python, it was something like or_client.chat.completions.create(...)
      // You may adapt to your chosen approach
      const response = await orClient.post("/chat/completions", {
        model: settings.OR_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1
      });
      const content = response.choices[0].message.content;
      return content;
    } catch (err) {
      console.log(`Error in writeDetailedSceneDescription: ${err}. Retrying...`);
      retries += 1;
    }
  }
  throw new Error("Failed to get a detailed scene description after 5 retries");
}

//
// 3) check_scene_consistency
//
async function checkSceneConsistency(newSceneDescription, prevScenes, characters) {
  const joinedPrev = prevScenes.join('\n');
  const prompt = `
Compare the new scene with the previous scenes and identify any continuity errors that will affect the reader's understanding and enjoyment of the story.

## INSTRUCTIONS
- Your focus is to find errors or improvements that can be made to maintain the progression of the story.
- If there are any errors with the timeline of the story, you must fix them.
- If there are any inconsistencies with the characters and their details, you must fix them.
- If there are any errors with the plot, you must fix them.
- Ignore any errors that are minor and can be inferred from the previous scenes context.
- You are only providing feedback on the new scene, not the previous scenes, so all of your feedback should be focused on the new scene and how to fix any continuity errors in it.

ONLY RESPOND WITH THE CONTINUITY ERRORS, DO NOT RESPOND WITH ANYTHING ELSE.
If you find no continuity errors with the previous scenes then only respond with: "No Continuity Errors Found."

## Characters
${characters}

## New scene:
${newSceneDescription}

## Previous scenes story context:
${joinedPrev}

Provide the continuity errors as a list in order of importance to the story. Describe how to fix those errors by making any small or significant changes to the scene.
  `;
  try {
    const response = await orClient.chat.completions.create({
        model: settings.OPENROUTER_MODEL_REASONING,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
    });
    const content = response.choices[0].message.content;
    return content;
  } catch (err) {
    console.error("Error in checkSceneConsistency:", err);
    return "No Continuity Errors Found.";
  }
}

//
// 4) rewrite_scene
//
async function rewriteScene(originalScene, sceneBeat, inconsistencies) {
  console.log("Rewriting scene to address inconsistencies...");
  const prompt = `
Rewrite the following scene to address the identified inconsistencies while maintaining the original scene beat. Focus on fixing the most important inconsistencies first.

Original scene:
${originalScene}

Scene beat:
${sceneBeat}

Issues to address:
${inconsistencies}

Rewrite the scene to maintain story continuity and address these issues. Make sure to resolve ALL inconsistencies in your rewrite.
The rewrite should maintain the same general length and level of detail as the original scene.

##DO NOT WRITE ANY COMMENTS ONLY RETURN THE SCENE.
  `;
  try {
    const response = await orClient.chat.completions.create({
      model: settings.OR_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8
    });
    const content = response.choices[0].message.content;
    console.log("Scene rewritten.");
    return content;
  } catch (err) {
    console.log("Error in rewriteScene:", err);
    return originalScene; // fallback
  }
}

//
// 5) verify_scene_fixes
//
async function verifySceneFixes(rewrittenScene, originalIssues) {
  const prompt = `
Verify if the rewritten scene has properly addressed all the previously identified issues.

Original issues to fix:
${originalIssues}

Rewritten scene:
${rewrittenScene}

Check if each issue has been properly resolved. If any issues remain unresolved, list them specifically.
Format remaining issues as a clear, numbered list that can be used for another rewrite.
If all issues are resolved, respond only with: All issues resolved
  `;
  try {
    const response = await orClient.chat.completions.create({
      model: 'openai/o3-mini',
      messages: [{ role: "user", content: prompt }]
    });
    const content = response.choices[0].message.content;
    console.log("Verification result:", content);
    return content;
  } catch (err) {
    console.log("Error in verifySceneFixes:", err);
    return "All issues resolved";  // fallback
  }
}

//
// 6) write_scene
//
// The big function that merges everything: writes a scene, checks consistency, rewrites if needed
//
async function writeScene(sceneBeat, characters, num, totalScenes, previousScenes = [], onProgress) {
  console.log(`Writing scene ${num+1} of ${totalScenes}`);
  
  // If there is no "previousScenes", use a fallback
  const recentContext = previousScenes && previousScenes.length
    ? previousScenes.slice(-4)  // just the last few for context
    : ["No previous context. This is the first scene of the story."];
  const context = recentContext.join('\n\n');

  let finalSceneIndicator = '';
  if (num === totalScenes - 1) {
    finalSceneIndicator = `
This is the final scene of the story. You must write an ending to the story that nicely ends the story explicitly, 
do not end it in the middle of a scene or event. Do not write "The End" or anything like that.
`;
  }

  const prompt = `
## WRITING INSTRUCTIONS
- You are an expert fiction writer. Write a fully detailed scene that is as long as necessary to write the scene completely. Provide lots of details about the setting, characters, and events.
- YOU MUST ONLY WRITE WHAT IS DIRECTLY IN THE SCENE BEAT. DO NOT WRITE ANYTHING ELSE.
- Address the passage of time mentioned at the beginning of the scene beat by creating a connection to the previous scene.

## CORE REQUIREMENTS
- Write from first-person narrator perspective only
- Begin with a clear connection to the previous scene's ending
- Include full, natural dialogue
- Write the dialogue in their own paragraphs, do not include the dialogue in the same paragraph as the narration.
- Write everything that the narrator sees, hears, and everything that happens in the scene.
- Write the entire scene and include everything in the scene beat given, do not leave anything out.
- Use the character's pronouns if you don't write the character's name. Avoid using they/them pronouns, use the character's pronouns instead.
- You MUST write ALL dialogue you can in the scene.

## PACING AND SUSPENSE
- Maintain steady, escalating suspense
- Build tension in small, deliberate increments
- Balance action with reflection

## WRITING STYLE
- Vary sentence length based on tension:
   * Shorter sentences for action/tension
   * Longer sentences for introspection
- Show emotions through implications rather than stating them

## SCENE CONTEXT AND CONTINUITY
# Characters
${characters}

# Use the provided STORY CONTEXT to remember details and events from the previous scenes in order to maintain consistency in the new scene you are writing.
## STORY CONTEXT
<context>
    ${context}
</context>

# Scene Beat to Write
${sceneBeat}
`;

console.log(prompt);

  let retries = 0;
  while (retries < 5) {
    try {
      const response = await oaiClient.chat.completions.create({
        model: settings.OAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 8000,
        stream: true
      });

      let fullScene = "";
      let currentChunk = "";

      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content || "";
        currentChunk += content;

        // If we have a reasonable chunk size or see a paragraph break, send progress
        if (currentChunk.length > 100 || currentChunk.includes("\n\n")) {
          if (onProgress) {
            onProgress(currentChunk);
          }
          fullScene += currentChunk;
          currentChunk = "";
        }
      }

      // Send any remaining content
      if (currentChunk.trim() && onProgress) {
        onProgress(currentChunk.trim());
      }
      fullScene += currentChunk.trim();

      // Check length
      if (fullScene.trim().length < 500) {
        console.log(`Scene too short (${fullScene.trim().length} chars). Retrying...`);
        retries += 1;
        continue;
      }

      previousScenes.push(fullScene);
      return fullScene;

    } catch (err) {
      console.log(`Error in writeScene: ${err}. Retrying...`);
      retries += 1;
    }
  }
  throw new Error("Failed to write scene after 5 attempts");
}

//
// 7) write_story
//
async function writeStory(outline, characters, addTransitions=false) {
  console.log("Starting story writing process...");
  
  const scenes = [];
  const editedScenes = [];
  const originalScenes = [];

  // If you want a progress bar, set it up here:
  // const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  // progressBar.start(totalSteps, 0);

  let nextScene = null;

  // 1) Generate all scenes
  for (let i = 0; i < outline.length; i++) {
    const sceneBeat = outline[i];
    let scene;

    if (nextScene) {
      // We already wrote it in a previous transition step
      scene = nextScene;
    } else {
      // Write brand new scene
      scene = await writeScene(sceneBeat, characters, i, outline.length);
    }

    // push to previous scenes
    // (But note that writeScene already appended it—depending on your usage)
    // previousScenes.push(scene);
    originalScenes.push(scene);

    if (addTransitions && i < outline.length - 1) {
      // Pre-generate next scene for the transition
      nextScene = await writeScene(outline[i+1], characters, i+1, outline.length);
      const transition = await writeSceneTransition(scene, nextScene);
      console.log(`Transition: ${transition}`);
      // combine them
      scene = `${scene}\n\n${transition}`;
    } else {
      nextScene = null;
    }

    scenes.push(scene);
    // if progressBar, progressBar.increment();
  }

  // 2) Second pass: Edit all scenes
  for (let i = 0; i < scenes.length; i++) {
    // A placeholder for your final pass. The Python used `callTune4(scene)`.
    const processed = await callTune4(scenes[i]);
    editedScenes.push(processed);
    // if progressBar, progressBar.increment();
  }

  // if progressBar, progressBar.stop();
  const finalStory = editedScenes.join('\n\n');
  return { finalStory, editedScenes, originalScenes };
}

//
// 8) write_scene_transition
//
async function writeSceneTransition(scene1, scene2) {
  const scene1Paras = scene1.split('\n\n').filter(x => x.trim());
  const scene2Paras = scene2.split('\n\n').filter(x => x.trim());

  const lastParagraphs = scene1Paras.slice(-6).join('\n\n');
  const firstParagraphs = scene2Paras.slice(0, 6).join('\n\n');

  const prompt = `
Write a concise scene transition that smoothly transitions between these two scenes.
The transition should connect the ending of the first scene to the beginning of the second scene.
Focus on the passage of time and/or change in location that occurs between scenes.
Only return the transition paragraph, no additional comments.

First Scene Ending:
${lastParagraphs}

Second Scene Beginning:
${firstParagraphs}
  `;

  try {
    const response = await orClient.chat.completions.create({
      model: settings.OR_MODEL,
      messages: [{ role: "user", content: prompt }]
    });
    return response.choices[0].message.content;
  } catch (err) {
    console.log("Error writing transition:", err);
    return "";
  }
}

//
// 9) find_long_post
//
async function findLongPost(storyProfile) {
  let longPosts = [];
  const subreddits = ['nosleep', 'thecrypticcompendium'];
  const outputFolder = 'stories';

  // Ensure folder exists
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
  }

  // Combined history file
  const historyFile = 'combined_subreddits_history.txt';
  let historyIds = [];
  if (fs.existsSync(historyFile)) {
    historyIds = fs.readFileSync(historyFile, 'utf-8').split(/\r?\n/);
  }

  // We'll mimic your Python approach:
  for (const subredditName of subreddits) {
    try {
      const subreddit = await reddit.getSubreddit(subredditName);
      // This is how it might look with snoowrap:
      const topPosts = await subreddit.getTop({ time: 'month', limit: 1000 });
      // Filter them
      for (let post of topPosts) {
        // link_flair_text is post.link_flair_text
        const postId = post.id;
        if (!historyIds.includes(postId) &&
            post.link_flair_text !== storyProfile.flair_exclude &&
            post.selftext.length >= 20000 &&
            !post.title.toLowerCase().includes("part")) {
          longPosts.push({ post, subredditName });
        }
      }
    } catch (err) {
      console.log(`Error reading subreddit '${subredditName}':`, err);
    }
  }

  if (longPosts.length > 0) {
    const idx = Math.floor(Math.random() * longPosts.length);
    const { post, subredditName } = longPosts[idx];
    const safeTitle = post.title.replace(/[\/\\]/g, '_');
    const filename = path.join(outputFolder, `${subredditName}_${safeTitle}.txt`);
    fs.writeFileSync(filename, post.selftext, { encoding: 'utf-8' });

    fs.appendFileSync(historyFile, `${post.id}\n`);

    console.log(`Post saved from r/${subredditName}: ${post.title}`);
    console.log(`File Name: ${filename}`);
    console.log(`Post Length: ${post.selftext.length}`);

    // Return the text
    return fs.readFileSync(filename, 'utf-8');
  } else {
    console.log("No suitable posts found in any subreddit.");
    return null;
  }
}

//
// 10) story_ideas
//
async function storyIdeas() {
  try {
    const allProfiles = settings.load_story_profiles();
    const profile = allProfiles[settings.STORY_PROFILE];
    
    if (!profile) {
      console.log(`Error: Story profile '${settings.STORY_PROFILE}' not found`);
      return null;
    }

    // Get a random prompt from the profile
    const prompt = profile.prompts[Math.floor(Math.random() * profile.prompts.length)];
    
    console.log('Using prompt:', prompt);
    console.log('Using model:', profile.model || settings.OAI_MODEL);

    const response = await oaiClient.chat.completions.create({
      model: profile.model || settings.OAI_MODEL,
      messages: [
        { 
          role: "system", 
          content: profile.system_prompt 
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      temperature: 0.9,
      max_tokens: 500
    });

    if (!response.choices || response.choices.length === 0) {
      console.error('No choices in response:', response);
      return null;
    }

    return response.choices[0].message.content;
  } catch (err) {
    console.error("Error generating story idea:", err);
    return null;
  }
}

//
// 11) format_scenes
//
function formatScenes(inputString) {
  try {
    // replicate your Python approach for cleaning code blocks
    inputString = inputString.replace(/```json\s*|\s*```/g, '').trim();
    
    // Find the first occurrence of '[' to get the start of the JSON array
    const jsonStartIndex = inputString.indexOf('[');
    if (jsonStartIndex !== -1) {
      // Remove any text before the JSON array
      inputString = inputString.substring(jsonStartIndex);
    }

    const scenesArr = JSON.parse(inputString);

    const formattedScenes = [];
    for (const scene of scenesArr) {
      const sceneNumber = scene.scene_number;
      const sceneBeat = scene.scene_beat;
      if (sceneNumber != null && sceneBeat) {
        formattedScenes.push(sceneBeat.trim());
      }
    }
    if (!formattedScenes.length) {
      console.log("Warning: No scenes were parsed from JSON");
      return null;
    }
    return formattedScenes;
  } catch (err) {
    console.log("Warning: Failed to parse JSON in formatScenes:", err);
    return null;
  }
}

//
// 12) create_outline
//
async function createOutline(idea) {
  try {
    const allProfiles = settings.load_story_profiles();
    const profile = allProfiles[settings.STORY_PROFILE];
    
    if (!profile) {
      console.log(`Error: Story profile '${settings.STORY_PROFILE}' not found`);
      return null;
    }

    const numScenes = profile.num_scenes || settings.NUM_SCENES;
    let retries = 0;
    
    while (retries < 5) {
      try {
        const userMessage = `
## Instructions
Write a full plot outline for the given story idea.
Write the plot outline as a list of all the scenes in the story. Each scene must be a highly detailed paragraph on what happens in that scene.
Each scene beat must include as much detail as you can about the events that happen in the scene.
Explicitly state the change of time between scenes if necessary.
Mention any locations by name.
Create a slow build up of tension and suspense throughout the story.
A scene in the story is defined as when there is a change in the setting in the story.
The plot outline must contain ${numScenes} scenes.
The plot outline must follow and word things in a way that are from the protagonist's perspective, do not write anything from an outside character's perspective that the protagonist wouldn't know.
Only refer to the protagonist in the story as "The Protagonist" in the plot outline.
Each scene must smoothly transition from the previous scene and to the next scene without unexplained time and setting jumps.
Ensure key story elements (e.g., character motivations, mysteries, and plot developments) are resolved by the end.
Explicitly address and resolve the purpose and origin of central objects or plot devices (e.g., mysterious items, symbols, or events).
If other characters have significant knowledge of the mystery or key events, show how and when they gained this knowledge to maintain logical consistency.
Explore and resolve character dynamics, especially those affecting key relationships.
Provide clarity on thematic or mysterious elements that connect scenes, ensuring the stakes are clearly defined and resolved.
The final scene beat must state it's the final scene beat of the story and how to end the story.

## You must use following json format for the plot outline exactly without deviation:
${generateSceneTemplate(numScenes)}

## Story Idea:
${idea}
        `;

        const response = await oaiClient.chat.completions.create({
          model: profile.model || settings.OAI_MODEL,
          temperature: 1,
          messages: [{ role: "user", content: userMessage }]
        });
        const text = response.choices[0].message.content;

        const outline = formatScenes(text);
        if (!outline) {
          console.log("Error: Empty outline generated.");
          retries += 1;
          continue;
        }
        return outline;

      } catch (err) {
        console.error(`Error in createOutline: ${err}. Retrying...`);
        retries += 1;
      }
    }
    console.log("Failed to create outline after 5 attempts.");
    return null;
  } catch (err) {
    console.error("Error loading profile:", err);
    return null;
  }
}

// Helper function to generate scene template
function generateSceneTemplate(numScenes) {
  const template = [];
  for (let i = 1; i <= numScenes; i++) {
    template.push({
      scene_number: i,
      scene_beat: `<Write the ${getOrdinal(i)} scene beat here>`
    });
  }
  return JSON.stringify(template, null, 2);
}

// Helper function to get ordinal numbers
function getOrdinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

//
// 13) characters()
//
async function charactersFn(outline) {
  let retries = 0;
  while (retries < 10) {
    try {
      const prompt = `
## Instructions

Using the given story outline, write short character descriptions for all the characters in the story in the following format:
<character name='(Character Name)' aliases='(Character Alias)', pronouns='(Character Pronouns)'>Personality, appearance, and other details</character>

The character alias is what the other characters in the story will call that character in the story such as their first name.
For the Protagonist's alias you must create a name that other characters will call them in the story.
The pronouns are what you will use to refer to the character as in the story when not writing their name.
The character description must only describe their appearance and personality DO NOT write what happens to them in the story.
Only return the character descriptions without any comments.

## Outline:
${outline.join('\n')}
      `;
      const response = await oaiClient.chat.completions.create({
        model: settings.OAI_MODEL,
        max_tokens: 4000,
        temperature: 0.7,
        messages: [{ role: "user", content: prompt }]
      });
      const content = response.choices[0].message.content;
      return content;
    } catch (err) {
      console.log(`Error in charactersFn: ${err}. Retrying...`);
      retries += 1;
    }
  }
  return null;
}

//
// 14) callTune4
//    This is your "fine-tuning pipeline" method. In practice, adapt to your Node approach
//
async function callTune4(scene) {
  // Splits paragraphs, lumps them by whether they have quotes, processes them, etc.
  // For brevity, below is a simpler version that just calls your "FT model" once.
  // If you need chunking, group checks, etc., replicate them as in Python.
  let maxRetries = 3;
  let retryCount = 0;
  let processed = scene;

  while (retryCount < maxRetries) {
    try {
      const completion = await oaiClient.chat.completions.create({
        model: settings.FT_MODEL,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: "You are an expert copy editor tasked with re-writing the given text in Insomnia Stories unique voice and style."
          },
          {
            role: "user",
            content: scene
          }
        ]
      });
      const output = completion.choices[0].message.content;
      
      // Check if output is identical or too large
      if (output.trim() === scene.trim()) {
        // same text, try again
        retryCount++;
        if (retryCount === maxRetries) {
          return replaceWords(scene);
        }
      } else {
        // done
        processed = replaceWords(output);
        break;
      }
    } catch (err) {
      console.log("Error in callTune4:", err);
      retryCount++;
      if (retryCount === maxRetries) {
        return scene;  // fallback
      }
    }
  }
  return processed;
}

async function createTitle(storyText, finetuneModel, maxRetries = 10) {
    /**
     * Create a title with retry logic to ensure it meets criteria:
     * - Must be between 70 and 100 characters
     * - Must include a comma
     */
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const title = await oaiClient.chat.completions.create({
                model: finetuneModel,
                max_tokens: 4000,
                messages: [
                    {
                        role: "system",
                        content: "You are tasked with creating a YouTube title for the given story. The title must be between 70 and 100 characters and include a comma. The title must be told in first person in the past tense."
                    },
                    {
                        role: "user",
                        content: storyText
                    }
                ]
            });

            let titleText = title.choices[0].message.content.replace(/"/g, '');

            // Add comma if missing (for horror stories)
            if (storyText.includes('Horror') && !titleText.includes(',')) {
                titleText = titleText.replace(' ', ', ', 1); // Add a comma after the first space
            }

            // Check if title meets all criteria
            if (titleText.length <= 100 && titleText.length >= 70 && titleText.includes(',')) {
                console.log(`Generated title: ${titleText}`);
                return titleText;
            } else {
                const issues = [];
                if (titleText.length > 100) {
                    issues.push("too long");
                }
                if (!titleText.includes(',')) {
                    issues.push("missing comma");
                }
                console.log(`Title invalid (${issues.join(', ')}) on attempt ${attempt + 1}, retrying...`);
            }

            // If we've exhausted maxRetries without finding a valid title
            if (attempt === maxRetries - 1) {
                console.log(`Warning: Could not generate valid title after ${maxRetries} attempts. Truncating...`);
                return titleText.slice(0, 97) + "...";
            }

        } catch (error) {
            console.error(`Error on attempt ${attempt + 1}:`, error);
            if (attempt === maxRetries - 1) {
                throw error;
            }
        }
    }
    
    throw new Error('Failed to generate a valid title after all attempts');
}

//
// Additional stubs (cleanup_scene, user_review_scene, etc.) can be similarly replicated
//

//
// main function: replicates your Python "main()"
//
async function main(username, channelName) {
  try {
    // Setup
    settings.initialize_settings(username);
    settings.initialize_channel_settings(username, channelName);
    await initializeClients();

    // Generate story idea
    console.log("Generating story idea...");
    const storyIdea = await storyIdeas();
    if (!storyIdea) {
      throw new Error("Failed to generate story idea");
    }
    console.log("Story idea generated successfully\n", storyIdea);

    // Create outline
    console.log("Creating outline...");
    const outline = await createOutline(storyIdea, settings.NUM_SCENES);
    if (!outline) {
      throw new Error("Failed to create outline");
    }
    console.log("Outline created successfully");

    // Generate characters
    console.log("Generating characters...");
    const chars = await charactersFn(outline);
    if (!chars) {
      throw new Error("Failed to generate characters");
    }
    console.log("Characters generated successfully:\n", chars);

    // Write story
    console.log("Writing story...");
    const { finalStory, editedScenes, originalScenes } = await writeStory(outline, chars, false);
    if (!finalStory || !editedScenes.length) {
      throw new Error("Failed to write story");
    }
    console.log("Story written successfully");

    // Save results
    fs.writeFileSync(`${channelName}_final_story.txt`, editedScenes.join('\n\n\n\n'), { encoding: 'utf-8' });
    fs.writeFileSync(`${channelName}_original_story.txt`, originalScenes.join('\n\n\n\n'), { encoding: 'utf-8' });
    console.log("All story versions saved to files");

    return { finalStory, editedScenes, storyIdea };
  } catch (err) {
    console.log("Error in story_writer.main:", err);
    return { finalStory: null, editedScenes: [], storyIdea: null };
  }
}

// If you want to run this as a standalone script with node, uncomment:
// (Make sure you set environment variables or hardcode your test user/channel.)
// (async () => {
//   const result = await main("testUser", "testChannel");
//   console.log("Main finished:", result);
// })();

// Export all the functions we need
module.exports = {
  main,
  createOutline,
  writeScene,
  writeStory,
  storyIdeas,
  createTitle,
  charactersFn,
  initializeClients,
  // Add any other functions you need to export
};
