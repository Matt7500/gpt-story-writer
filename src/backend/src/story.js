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
const { Configuration, OpenAIApi } = require('openai');
// For Reddit, consider using snoowrap or a similar library:
const Snoowrap = require('snoowrap');

// If you want a progress bar similar to tqdm, install a Node package like cli-progress
// and import it here:
// const cliProgress = require('cli-progress');

//
// Example "settings" object. You can place this in a separate settings.js file
// and import it, or read from environment variables, etc.
//
const settings = {
  OAI_API_KEY: process.env.OAI_API_KEY || '',       // OpenAI API key
  OR_API_KEY: process.env.OR_API_KEY || '',         // OpenRouter or custom API key
  OR_MODEL: process.env.OR_MODEL || 'openai/o3-mini',                       // Example model name for "OpenRouter"
  OAI_MODEL: process.env.OAI_MODEL || 'gpt-4',                               // Example OpenAI model name
  FT_MODEL: process.env.FT_MODEL || 'ft:gpt-4o-2024-08-06:personal:jgrupe-narration-ft:AQnm6wr1', // Custom fine-tuned model, etc.
  USE_REDDIT: false,                                // If you want to use the Reddit logic
  USE_FINE_TUNE: false,                             // If you want to call your fine-tuned models
  STORY_PROFILE: 'myStoryProfileName',              // Example
  NUM_SCENES: 8,                                    // Default # of scenes if not overridden
  // ...any other settings needed
  // functions or stubs to load story profiles from DB, etc.
  load_story_profiles: function() {
    return {
      // This is a placeholder. Your real data would come from Mongo or somewhere else.
      myStoryProfileName: {
        flair_exclude: 'NoSleep: Collab',
        prompts: ["Some random story prompt..."],
        system_prompt: "System message describing style/tone constraints...",
        model: "gpt-4",
      }
    };
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
    const configuration = new Configuration({ apiKey: settings.OAI_API_KEY });
    oaiClient = new OpenAIApi(configuration);
    console.log("OpenAI client initialized successfully");
  } catch (err) {
    console.error("Error initializing OpenAI client:", err);
    throw err;
  }

  // Create "OpenRouter" or custom client
  // In Python, you used something like:
  // or_client = OpenAI(base_url="https://openrouter.ai/api/v1", ...)
  // Below is a placeholder using plain axios:
  if (settings.OR_API_KEY) {
    orClient = axios.create({
      baseURL: "https://openrouter.ai/api/v1",
      headers: { Authorization: `Bearer ${settings.OR_API_KEY}` }
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
      const content = response.data.choices[0].message.content;
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
    const content = response.data.choices[0].message.content;
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
    const content = response.data.choices[0].message.content;
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
    const content = response.data.choices[0].message.content;
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
async function writeScene(sceneBeat, characters, num, totalScenes) {
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
## SCENE CONTEXT AND CONTINUITY
# Characters
${characters}

# Use the provided STORY CONTEXT to remember details and events from the previous scenes in order to maintain consistency in the new scene you are writing.
## STORY CONTEXT
${context}

# Scene Beat to Write
${sceneBeat}

## WRITING INSTRUCTIONS
You are an expert fiction writer. Write a fully detailed scene as long as you need to without overwriting that flows naturally from the previous events described in the context.
${finalSceneIndicator}

# Core Requirements
- Write from first-person narrator perspective only
- Begin with a clear connection to the previous scene's ending
- Include full, natural dialogue
- Write the dialogue in their own paragraphs, do not include the dialogue in the same paragraph as the narration.
- Write everything that the narrator sees, hears, and everything that happens in the scene.
- Write the entire scene and include everything in the scene beat given, do not leave anything out.
- Use the character's pronouns if you don't write the character's name. Avoid using they/them pronouns, use the character's pronouns instead.

# Pacing and Suspense
- Maintain steady, escalating suspense
- Use strategic pauses and silence for impact
- Build tension in small, deliberate increments
- Balance action with reflection

# Writing Style
- Use concise, sensory-rich language
- Vary sentence length based on tension:
   * Shorter sentences for action/tension
   * Longer sentences for introspection
- Show emotions through implications rather than stating them

# Scene Structure
- Write tight, focused paragraphs
- Layer the scene from normal to unsettling
- Break up dialogue with introspection and description
- Include moments of dark humor sparingly
- Allow for natural processing of events
  `;

  let retries = 0;
  while (retries < 5) {
    try {
      // 1) generate the scene
      const response = await oaiClient.chat.completions.create({
        model: settings.OAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 8000
      });
      let writtenScene = response.data.choices[0].message.content
        .replace(/\*/g, '')
        .replace(/---\n/g, '')
        .replace(/\n\n---/g, '');

      // Check length
      if (writtenScene.trim().length < 500) {
        console.log(`Scene too short (${writtenScene.trim().length} chars). Retrying...`);
        retries += 1;
        continue;
      }

      // 2) Attempt a consistency check and rewriting loop
      let attempt = 0;
      const maxAttempts = 3;
      while (attempt < maxAttempts) {
        const inconsistencies = await checkSceneConsistency(writtenScene, previousScenes, characters);
        if (!inconsistencies || inconsistencies.includes("No Continuity Errors Found")) {
          // done
          previousScenes.push(writtenScene);
          return writtenScene;
        }

        console.log(`Attempt ${attempt+1}: Rewriting scene to fix inconsistencies...`);
        writtenScene = await rewriteScene(writtenScene, sceneBeat, inconsistencies);

        // verify
        const verification = await verifySceneFixes(writtenScene, inconsistencies);
        if (verification === "All issues resolved") {
          previousScenes.push(writtenScene);
          return writtenScene;
        } else {
          // rewrite again with leftover issues
          writtenScene = await rewriteScene(writtenScene, sceneBeat, verification);
        }
        attempt++;
        console.log(`Verification failed. Remaining issues: ${verification}`);
      }

      console.log("Warning: Maximum rewrite attempts reached. Using best version.");
      previousScenes.push(writtenScene);
      return writtenScene;

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
    return response.data.choices[0].message.content;
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
  // Get story_profile from settings
  const storyProfileName = settings.STORY_PROFILE;
  let storyProfile;
  try {
    const allProfiles = settings.load_story_profiles();
    storyProfile = allProfiles[storyProfileName];
    if (!storyProfile) {
      console.log(`Error: Story profile '${storyProfileName}' not found`);
      return null;
    }
  } catch (err) {
    console.log("Error loading story profiles:", err);
    return null;
  }

  // If using Reddit
  if (settings.USE_REDDIT) {
    return await findLongPost(storyProfile);
  }
  // If using fine-tune
  else if (settings.USE_FINE_TUNE) {
    const prompt = storyProfile.prompts[Math.floor(Math.random() * storyProfile.prompts.length)];
    console.log(prompt);
    // Example call to a fine-tuned model:
    const messages = [
      { role: "system", content: storyProfile.system_prompt },
      { role: "user", content: prompt }
    ];
    const response = await oaiClient.createChatCompletion({
      model: storyProfile.model,
      messages
    });
    return response.data.choices[0].message.content;
  }
  // Otherwise fallback
  else {
    const prompt = storyProfile.prompts[Math.floor(Math.random() * storyProfile.prompts.length)];
    const messages = [{ role: "user", content: prompt }];
    const response = await oaiClient.createChatCompletion({
      model: 'gpt-4',
      messages
    });
    return response.data.choices[0].message.content;
  }
}

//
// 11) format_scenes
//
function formatScenes(inputString) {
  try {
    // replicate your Python approach for cleaning code blocks
    inputString = inputString.replace(/```json\s*|\s*```/g, '').trim();
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
async function createOutline(idea, num=12) {
  const realNum = Math.floor(Math.random() * 4) + 6; // from 6 to 9 (like in Python)
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
The plot outline must contain ${realNum} scenes.
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
[
  {"scene_number": 1, "scene_beat": "<Write the first scene beat here>"},
  {"scene_number": 2, "scene_beat": "<Write the second scene beat here>"},
  {"scene_number": 3, "scene_beat": "<Write the third scene beat here>"},
  {"scene_number": 4, "scene_beat": "<Write the fourth scene beat here>"},
  {"scene_number": 5, "scene_beat": "<Write the fifth scene beat here>"},
  {"scene_number": 6, "scene_beat": "<Write the sixth scene beat here>"},
  {"scene_number": 7, "scene_beat": "<Write the seventh scene beat here>"},
  {"scene_number": 8, "scene_beat": "<Write the eighth scene beat here>"},
  {"scene_number": 9, "scene_beat": "<Write the ninth scene beat here>"},
  {"scene_number": 10, "scene_beat": "<Write the tenth scene beat here>"},
  {"scene_number": 11, "scene_beat": "<Write the eleventh scene beat here>"},
  {"scene_number": 12, "scene_beat": "<Write the twelfth scene beat here>"}
]

## Story Idea:
${idea}
      `;

      // The Python code used oai_client with a certain model and temperature
      const response = await oaiClient.chat.completions.create({
        model: settings.OAI_MODEL,
        temperature: 1,
        messages: [{ role: "user", content: userMessage }]
      });
      const text = response.data.choices[0].message.content;
      console.log(text);

      const outline = formatScenes(text);
      if (!outline) {
        console.log("Error: Empty outline generated.");
        retries += 1;
        continue;
      }
      return outline;

    } catch (err) {
      console.log(`Error in createOutline: ${err}. Retrying...`);
      retries += 1;
    }
  }
  console.log("Failed to create outline after 5 attempts.");
  return null;
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
<character name='(Character Name)' aliases='(Character Alias)', pronouns='(Character Pronouns)'>(Personality, appearance, and other details)</character>

The character alias is what the other characters in the story will call that character in the story such as their first name.
For the Protagonist's alias you must create a name that other characters will call them in the story.
The pronouns are what you will use to refer to the character as in the story when not writing their name.
The character description must only describe their appearance and personality DO NOT write what happens to them in the story.
Only return the character descriptions without any comments.

## Outline:
${outline.join('\n')}
      `;
      const response = await orClient.chat.completions.create({
        model: settings.OR_MODEL,
        max_tokens: 4000,
        temperature: 0.7,
        messages: [{ role: "user", content: prompt }]
      });
      const content = response.data.choices[0].message.content;
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
      const output = completion.data.choices[0].message.content;
      
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

module.exports = {
  main,
  createOutline,
  writeScene,
  writeStory,
  // ...plus whichever other functions you want to export.
};
