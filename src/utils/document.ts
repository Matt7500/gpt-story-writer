/**
 * Utility functions for managing document properties like title
 */

/**
 * Sets the document title with an optional prefix or suffix
 * @param title The main title to set
 * @param options Configuration options
 */
export const setDocumentTitle = (
  title: string,
  options: {
    prefix?: string;
    suffix?: string;
    includeAppName?: boolean;
  } = {}
) => {
  const { prefix, suffix, includeAppName = true } = options;
  
  let fullTitle = title;
  
  if (prefix) {
    fullTitle = `${prefix} ${fullTitle}`;
  }
  
  if (includeAppName) {
    fullTitle = `${fullTitle} | Plotter Palette`;
  }
  
  if (suffix) {
    fullTitle = `${fullTitle} ${suffix}`;
  }
  
  document.title = fullTitle;
}; 