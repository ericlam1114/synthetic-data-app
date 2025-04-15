// lib/utils/pdfParseWrapper.js
// A wrapper around pdf-parse to avoid the direct execution issue

// Import the core module function only, avoiding the self-execution code at the module level
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

// Export the function
module.exports = pdfParse; 