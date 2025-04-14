// lib/utils/promptBuilder.js

/**
 * Build a system prompt that incorporates the organization's writing style
 * 
 * @param {string} orgStyleSample - Text sample representing the organization's style
 * @returns {string} - Complete system prompt with style guidance
 */
export function buildOrgSystemPrompt(orgStyleSample) {
    // Base system prompt
    const basePrompt = 
      "You are a clause rewriter that upscales and rewrites informal, vague, or casual language into clear, professional organizational formatting with high fidelity. " +
      "Your output should match legal or business standards, even if the input is messy or shorthand. " + 
      "Always ensure each variant is a complete sentence or paragraph with proper beginning and ending. " +
      "Never produce partial or truncated sentences.";
    
    // If no style sample is provided, return the base prompt
    if (!orgStyleSample) {
      return basePrompt;
    }
    
    // Style-specific guidance
    const styleGuidance = 
      `Here is an example of the organization's preferred language style:
  
  """
  ${orgStyleSample}
  """
  
  Your output should mirror this tone, formality level, and terminology preferences while maintaining legal accuracy. Specifically:
  1. Match the sentence structure and complexity patterns
  2. Use similar transition words and phrases
  3. Maintain a similar level of detail and precision
  4. Preserve industry-specific terminology
  5. Follow similar formatting conventions
  
  The rewritten clause should feel like it was written by the same organization that produced the sample text above.`;
  
    // Combine base prompt with style guidance
    return `${basePrompt}\n\n${styleGuidance}`;
  }
  
  /**
   * Build a system prompt specifically for Q&A generation that incorporates the organization's writing style
   * 
   * @param {string} orgStyleSample - Text sample representing the organization's style
   * @returns {string} - Complete system prompt with style guidance for Q&A
   */
  export function buildOrgQASystemPrompt(orgStyleSample) {
    // Base system prompt for Q&A generation
    const basePrompt = 
      "You are an assistant trained to generate Q&A pairs from legal and business documents. " +
      "You will receive a clause and return a single Q&A pair formatted as plain text.";
    
    // If no style sample is provided, return the base prompt
    if (!orgStyleSample) {
      return basePrompt;
    }
    
    // Style-specific guidance for Q&A
    const styleGuidance = 
      `Here is an example of the organization's preferred language style:
  
  """
  ${orgStyleSample}
  """
  
  When generating questions and answers, mirror this organization's tone, formality level, and terminology preferences. Specifically:
  1. Format questions in a style that matches their documentation
  2. Use similar sentence structures and complexity in answers
  3. Incorporate their preferred terminology and industry jargon
  4. Maintain a similar level of detail and precision
  5. Follow their formatting conventions
  
  The generated Q&A should feel like it was written by the same organization that produced the sample text above.`;
  
    // Combine base prompt with style guidance
    return `${basePrompt}\n\n${styleGuidance}`;
  }