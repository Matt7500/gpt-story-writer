// Reddit doesn't require authentication for public data access via their JSON API
// We'll use fetch API to access Reddit's JSON endpoints

// Reddit API base URL
const REDDIT_API_BASE = 'https://www.reddit.com';

// Interface for Reddit post data
export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  permalink: string;
  created_utc: number;
  score: number;
  link_flair_text: string | null;
  num_comments: number;
  url: string;
}

// Get top posts from a subreddit
export const getTopPosts = async (
  subreddit: string,
  timeframe: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' = 'all',
  limit: number = 100
): Promise<RedditPost[]> => {
  try {
    const response = await fetch(
      `${REDDIT_API_BASE}/r/${subreddit}/top.json?t=${timeframe}&limit=${limit}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch from Reddit: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Transform the Reddit API response to our interface
    return data.data.children.map((child: any) => {
      const post = child.data;
      return {
        id: post.id,
        title: post.title,
        selftext: post.selftext,
        author: post.author,
        permalink: post.permalink,
        created_utc: post.created_utc,
        score: post.score,
        link_flair_text: post.link_flair_text,
        num_comments: post.num_comments,
        url: post.url
      };
    });
  } catch (error) {
    console.error('Error fetching Reddit posts:', error);
    throw error;
  }
};

// Filter posts by criteria
export const filterLongPosts = (
  posts: RedditPost[],
  minLength: number = 20000,
  excludeFlair: string = 'Series'
): RedditPost[] => {
  return posts.filter(post => 
    post.selftext.length >= minLength && 
    post.link_flair_text !== excludeFlair &&
    !post.title.toLowerCase().includes('part')
  );
};

// Get a random post from a filtered list
export const getRandomPost = (posts: RedditPost[]): RedditPost | null => {
  if (posts.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * posts.length);
  return posts[randomIndex];
}; 