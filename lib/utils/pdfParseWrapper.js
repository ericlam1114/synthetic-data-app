// lib/utils/pdfParseWrapper.js
// A wrapper around pdf-parse to avoid the direct execution issue

// Import the core module function only, avoiding the self-execution code at the module level
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

// Export the function
export { pdfParse }; 