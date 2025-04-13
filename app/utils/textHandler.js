// File: utils/textHandler.js
/**
 * Extract text blocks from Textract response
 * @param {Object} textractResponse - Response from AWS Textract
 * @returns {string} Extracted text as a string
 */
export const extractTextFromTextractResponse = (textractResponse) => {
    if (!textractResponse || !textractResponse.Blocks) {
      return '';
    }
  
    return textractResponse.Blocks
      .filter(block => block.BlockType === 'LINE')
      .map(block => block.Text)
      .join('\n');
  };
  
  /**
   * Format bytes to human-readable format
   * @param {number} bytes - Number of bytes
   * @param {number} decimals - Number of decimal places
   * @returns {string} Formatted string (e.g. "1.5 MB")
   */
  export const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
  
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
    const i = Math.floor(Math.log(bytes) / Math.log(k));
  
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };
  