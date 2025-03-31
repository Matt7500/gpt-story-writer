import { registerComposition, staticFile } from 'remotion';
import { StaticImageVideo, staticImageVideoSchema } from './StaticImageVideo'; 

// Register the composition for Lambda
registerComposition(StaticImageVideo, {
    // This ID MUST match the 'compositionId' used in your VideoExportService
    id: 'StaticImageVideo', 
    // Default props for Remotion Studio preview
    defaultProps: {
        imageUrl: 'https://via.placeholder.com/1920x1080.png?text=Default+Image',
        // Place sample audio files in public/ folder of Remotion project for preview
        narrationUrl: staticFile('sample-narration.mp3'), 
        musicUrl: staticFile('sample-music.mp3'), 
        title: 'Default Title'
    },
    // Video dimensions and fixed duration
    width: 1920, 
    height: 1080,
    durationInFrames: 900, // Match duration in component (30 seconds @ 30 FPS)
    fps: 30,
    // Link the Zod schema
    schema: staticImageVideoSchema,
});