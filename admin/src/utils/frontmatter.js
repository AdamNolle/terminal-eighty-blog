import matter from 'gray-matter';

/**
 * Parse frontmatter and content from a markdown string.
 * @param {string} fileContent - Raw markdown file content with optional YAML frontmatter.
 * @returns {{ data: Record<string, unknown>, content: string }} Parsed frontmatter and body.
 */
export function parsePost(fileContent) {
  const parsed = matter(fileContent);
  return {
    data: parsed.data, // Frontmatter object
    content: parsed.content, // Markdown body
  };
}

/**
 * Stringify frontmatter object and content back into a markdown string.
 * @param {Record<string, any>} data - Frontmatter fields to serialize.
 * @param {string} content - Markdown body.
 * @returns {string} Combined markdown string with YAML frontmatter.
 */
export function serializePost(data, content) {
  // Ensure tags are an array
  if (typeof data.tags === 'string') {
    data.tags = data.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  // Ensure date is properly formatted if provided, otherwise leave as is
  // matter.stringify handles dates, but we want ISO strings in the file if possible

  return matter.stringify(
    content,
    data,
    /** @type {any} */ ({
      // Options for gray-matter serialization
      engines: {
        yaml: {
          lineWidth: -1, // Prevent wrapping
        },
      },
    }),
  );
}
