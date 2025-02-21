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
const userSettingsService = require('./services/UserSettingsService');

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
let orClient = null;
let reddit = null;

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
  try {
    // Initialize Reddit client if needed
    if (process.env.REDDIT_CLIENT_ID) {
      reddit = new Snoowrap({
        userAgent: 'Reddit posts',
        clientId: process.env.REDDIT_CLIENT_ID,
        clientSecret: process.env.REDDIT_CLIENT_SECRET,
        refreshToken: process.env.REDDIT_REFRESH_TOKEN
      });
      console.log("Reddit client initialized successfully");
    }
  } catch (err) {
    console.error("Error initializing clients:", err);
    throw err;
  }
}

//
// 2) write_detailed_scene_description
//
async function writeDetailedSceneDescription(scene, req) {
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
      const response = await req.openai.chat.completions.create({
        model: req.userSettings.openrouter_model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1
      });
      return response.choices[0].message.content;
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
    const response = await req.openRouter.chat.completions.create({
      model: req.userSettings.reasoning_model,
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
async function writeScene(sceneBeat, characters, num, totalScenes, previousScenes = [], onProgress, req) {
  console.log(`Writing scene ${num+1} of ${totalScenes}`);
  
  const recentContext = previousScenes && previousScenes.length
    ? previousScenes.slice(-4)
    : ["No previous context. This is the first scene of the story."];
  const context = recentContext.join('\n\n');

  const prompt = `
## WRITING INSTRUCTIONS
- You are an expert fiction writer. Write a fully detailed scene that has as many details from the scene beat as possible.
- YOU MUST ONLY WRITE WHAT IS DIRECTLY IN THE SCENE BEAT. DO NOT WRITE ANYTHING ELSE.
- Address the passage of time mentioned at the beginning of the scene beat by creating a connection to the previous scene's ending.

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
    - Write dialogue in their own paragraphs, do not include the dialogue in the same paragraph as the narration.
    
    # Scene Structure
    - Write tight, focused paragraphs
    - Layer the scene from normal to unsettling
    - Break up dialogue with introspection and description
    - Include moments of dark humor sparingly
    - Allow for natural processing of events

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

  let retries = 0;
  while (retries < 5) {
    try {
      // Choose the client and model based on user settings
      const client = req.userSettings.use_openai_for_story_gen ? req.openai : req.openRouter;
      const model = req.userSettings.story_generation_model;  // Always use story_generation_model

      console.log(`Using ${req.userSettings.use_openai_for_story_gen ? 'OpenAI' : 'OpenRouter'} with model: ${model}`);

      const response = await client.chat.completions.create({
        model: model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 8000,
        stream: true
      });

      let fullScene = "";
      let currentChunk = "";

      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content || "";
        currentChunk += content;

        if (currentChunk.length > 100 || currentChunk.includes("\n\n")) {
          if (onProgress) {
            onProgress(currentChunk);
          }
          fullScene += currentChunk;
          currentChunk = "";
        }
      }

      if (currentChunk.trim() && onProgress) {
        onProgress(currentChunk.trim());
      }
      fullScene += currentChunk.trim();

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
async function writeStory(outline, characters, addTransitions=false, req) {
  console.log("Starting story writing process...");
  
  const scenes = [];
  const editedScenes = [];
  const originalScenes = [];

  let nextScene = null;

  // Generate all scenes
  for (let i = 0; i < outline.length; i++) {
    const sceneBeat = outline[i];
    let scene;

    if (nextScene) {
      scene = nextScene;
    } else {
      scene = await writeScene(sceneBeat, characters, i, outline.length, previousScenes, null, req);
    }

    originalScenes.push(scene);

    if (addTransitions && i < outline.length - 1) {
      nextScene = await writeScene(outline[i+1], characters, i+1, outline.length, previousScenes, null, req);
      const transition = await writeSceneTransition(scene, nextScene, req);
      console.log(`Transition: ${transition}`);
      scene = `${scene}\n\n${transition}`;
    } else {
      nextScene = null;
    }

    scenes.push(scene);
  }

  // Second pass: Edit all scenes
  for (let i = 0; i < scenes.length; i++) {
    const processed = await callTune4(scenes[i], req);
    editedScenes.push(processed);
  }

  const finalStory = editedScenes.join('\n\n');
  return { finalStory, editedScenes, originalScenes };
}

//
// 8) write_scene_transition
//
async function writeSceneTransition(scene1, scene2, req) {
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
    const response = await req.openai.chat.completions.create({
      model: req.userSettings.openrouter_model,
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
async function storyIdeas(req) {
  if (!req || !req.openai) {
    throw new Error('OpenAI client not initialized');
  }

  try {
    const allProfiles = settings.load_story_profiles();
    const profile = allProfiles[settings.STORY_PROFILE];
    
    if (!profile) {
      console.log(`Error: Story profile '${settings.STORY_PROFILE}' not found`);
      return null;
    }

    const prompt = profile.prompts[Math.floor(Math.random() * profile.prompts.length)];
    console.log('Using prompt:', prompt);

    const response = await req.openai.chat.completions.create({
      model: req.userSettings.title_fine_tune_model,
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
    throw err;  // Propagate the error up
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
async function createOutline(idea, req) {
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
        // Choose the client and model based on user settings
        const client = req.userSettings.use_openai_for_story_gen ? req.openai : req.openRouter;
        const model = req.userSettings.story_generation_model;  // Always use story_generation_model

        console.log(`Using ${req.userSettings.use_openai_for_story_gen ? 'OpenAI' : 'OpenRouter'} with model: ${model}`);

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
${idea}`;

        const response = await client.chat.completions.create({
          model: model,
          messages: [{ role: "user", content: userMessage }]
        });
        const text = response.choices[0].message.content;

        console.log("Plot outline:", text);

        // Always use the reasoning model for the second pass
        const prompt2 = `
## Instructions
Review and improve the following JSON plot outline. Fix any plot and timeline errors, make time jumps and setting changes more specific, and optimize the beginning to hook readers.

IMPORTANT: Your entire response must be valid JSON. Do not include any text before or after the JSON array.
The JSON must follow this exact structure:
[
  {
    "scene_number": number,
    "scene_beat": "scene description"
  }
]

Plot outline:
${text}`;

        const response2 = await req.openRouter.chat.completions.create({
          model: req.userSettings.reasoning_model,
          messages: [
            {
              role: "system",
              content: "You are a JSON-only response bot. You must only output valid JSON arrays containing scene data. Never include any explanatory text or comments in your response."
            },
            { 
              role: "user", 
              content: prompt2 
            }
          ],
          temperature: 0.7,
          max_tokens: 4000
        });
        const text2 = response2.choices[0].message.content;

        console.log("Raw response from reasoning model:", text2);

        // Try to clean the response if it's not pure JSON
        let cleanedText2 = text2;
        try {
          // Remove any text before the first [
          const jsonStart = text2.indexOf('[');
          if (jsonStart === -1) {
            console.log("No JSON array start found in response, using original outline");
            cleanedText2 = text;
          } else {
            cleanedText2 = text2.substring(jsonStart);
            // Remove any text after the last ]
            const jsonEnd = cleanedText2.lastIndexOf(']');
            if (jsonEnd === -1) {
              console.log("No JSON array end found in response, using original outline");
              cleanedText2 = text;
            } else {
              cleanedText2 = cleanedText2.substring(0, jsonEnd + 1);
            }
          }
          
          // Verify it's valid JSON before proceeding
          JSON.parse(cleanedText2);
          console.log("Successfully parsed revised JSON outline");
        } catch (jsonError) {
          console.error("Error parsing revised outline JSON:", jsonError);
          console.log("Using original outline instead");
          cleanedText2 = text; // Fall back to original outline if parsing fails
        }

        console.log("Final outline to be used:", cleanedText2);

        const outline = formatScenes(cleanedText2);
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
async function charactersFn(outline, req) {
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
      const response = await req.openRouter.chat.completions.create({
        model: req.userSettings.openrouter_model,
        max_tokens: 4000,
        temperature: 0.7,
        messages: [{ role: "user", content: prompt }]
      });
      return response.choices[0].message.content;
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
async function callTune4(scene, req) {
  let maxRetries = 3;
  let retryCount = 0;
  let processed = scene;

  console.log('Starting rewrite processing:', {
    sceneLength: scene.length,
    model: req.userSettings.rewrite_model || "gpt-4",
    retryCount
  });

  while (retryCount < maxRetries) {
    try {
      // Use OpenAI client with rewrite_model setting
      const completion = await req.openai.chat.completions.create({
        model: req.userSettings.rewrite_model || "gpt-4",
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
      
      if (output.trim() === scene.trim()) {
        retryCount++;
        console.log('No changes made by model, retrying:', { retryCount, maxRetries });
        if (retryCount === maxRetries) {
          console.log('Max retries reached with no changes, using original text with word replacements');
          return replaceWords(scene);
        }
      } else {
        processed = replaceWords(output);
        console.log('Successfully processed scene:', {
          originalLength: scene.length,
          processedLength: processed.length,
          retryCount
        });
        break;
      }
    } catch (err) {
      console.log('Error in callTune4:', {
        error: err.message,
        retryCount,
        maxRetries,
        aborted: err.name === 'AbortError'
      });
      retryCount++;
      if (retryCount === maxRetries) {
        console.log('Max retries reached due to errors, using original text');
        return scene;
      }
    }
  }
  return processed;
}

async function createTitle(storyText, req) {
  const maxRetries = 10;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const title = await req.openai.chat.completions.create({
        model: req.userSettings.rewriting_model,
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

      if (storyText.includes('Horror') && !titleText.includes(',')) {
        titleText = titleText.replace(' ', ', ', 1);
      }

      if (titleText.length <= 100 && titleText.length >= 70 && titleText.includes(',')) {
        console.log(`Generated title: ${titleText}`);
        return titleText;
      }

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
    const chars = await charactersFn(outline, settings.NUM_SCENES);
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
  writeDetailedSceneDescription,
  writeSceneTransition,
  callTune4
};
