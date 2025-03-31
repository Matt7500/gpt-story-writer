import { AbsoluteFill, Img, Audio, staticFile, useVideoConfig, useCurrentFrame } from 'remotion';
import { z } from 'zod'; // Import Zod for schema validation
import { StaticImageVideoProps } from './types'; // Import the shared props type

// Define the Zod schema for input props validation
export const staticImageVideoSchema = z.object({
  imageUrl: z.string().url(),
  narrationUrl: z.string().url(),
  musicUrl: z.string().url(),
  title: z.string(),
});

export const StaticImageVideo: React.FC<StaticImageVideoProps> = ({
  imageUrl,
  narrationUrl,
  musicUrl,
  title, 
}) => {
  // Using a fixed duration (e.g., 30 seconds @ 30 fps = 900 frames)
  // Ensure this is long enough for your expected audio.
  const durationInFrames = 900; 

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* Background image */}
      <AbsoluteFill>
        <Img 
          src={imageUrl} 
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
        />
      </AbsoluteFill>

      {/* Narration audio */}
      <Audio src={narrationUrl} /> 

      {/* Background music (reduced volume) */}
      <Audio src={musicUrl} volume={0.3} /> 
    </AbsoluteFill>
  );
};