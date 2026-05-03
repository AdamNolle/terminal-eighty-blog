import matter from 'gray-matter';

/**
 * Parse frontmatter and content from a markdown string
 */
export function parsePost(fileContent) {
    const parsed = matter(fileContent);
    return {
        data: parsed.data, // Frontmatter object
        content: parsed.content // Markdown body
    };
}

/**
 * Stringify frontmatter object and content back into a markdown string
 */
export function serializePost(data, content) {
    // Ensure tags are an array
    if (typeof data.tags === 'string') {
        data.tags = data.tags.split(',').map(t => t.trim()).filter(Boolean);
    }
    
    // Ensure date is properly formatted if provided, otherwise leave as is
    // matter.stringify handles dates, but we want ISO strings in the file if possible
    
    return matter.stringify(content, data, {
        // Options for gray-matter serialization
        engines: {
            yaml: {
                lineWidth: -1 // Prevent wrapping
            }
        }
    });
}
