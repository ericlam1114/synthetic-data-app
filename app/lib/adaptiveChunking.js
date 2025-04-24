/**
 * Performs adaptive chunking based on document characteristics
 * @param {string} text - The full document text
 * @param {Object} metadata - Optional document metadata
 * @returns {Array<string>} - Array of optimally sized chunks
 */
function adaptiveChunking(text, metadata = {}) {
  // 1. Analyze document characteristics
  const documentLength = text.length;
  const docType = detectDocumentType(text, metadata);
  const complexity = analyzeComplexity(text);
  
  // 2. Determine optimal chunk parameters based on document analysis
  const {
    chunkSize,
    chunkOverlap,
    splitByHeadings
  } = calculateChunkParameters(documentLength, docType, complexity);
  
  console.log(`[Adaptive Chunking] Params: size=${chunkSize}, overlap=${chunkOverlap}, splitByHeadings=${splitByHeadings}, type=${docType}, complexityScore=${complexity.complexity.toFixed(1)}`);
  
  // 3. Apply chunking strategy
  let chunks = [];
  if (splitByHeadings && docType === 'legal_contract') { // Only split by headings for legal contracts for now
    chunks = splitByDocumentHeadings(text, chunkSize, chunkOverlap);
    console.log(`[Adaptive Chunking] Split by headings resulted in ${chunks.length} chunks.`);
  } else {
    chunks = splitBySize(text, chunkSize, chunkOverlap);
    console.log(`[Adaptive Chunking] Split by size resulted in ${chunks.length} chunks.`);
  }
  
  return chunks;
}

/**
 * Detects document type using heuristics and metadata
 */
function detectDocumentType(text, metadata) {
  // Check metadata first if available
  if (metadata.docType) return metadata.docType;
  
  // Basic keywords check on the first 2000 chars
  const headerText = text.substring(0, 2000).toUpperCase();

  if (/AGREEMENT|CONTRACT|TERMS AND CONDITIONS|HEREINAFTER|WHEREAS/.test(headerText)) {
    return 'legal_contract';
  }
  
  if (/FINANCIAL STATEMENT|BALANCE SHEET|INCOME STATEMENT|CASH FLOW/.test(headerText)) {
    return 'financial_report';
  }
  
  if (/MEDICAL RECORD|PATIENT HISTORY|DIAGNOSIS|TREATMENT PLAN/.test(headerText)) {
    return 'medical_record';
  }
  
  // Add more specific detection logic here...
  
  return 'general'; // Default type
}

/**
 * Analyzes text complexity based on sentence structure, terminology, etc.
 */
function analyzeComplexity(text) {
   // Simple check for empty or very short text
  if (!text || text.length < 100) {
    return { avgSentenceLength: 0, legalDensity: 0, complexity: 0 };
  }

  // Split into sentences (more robust pattern)
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]; // Fallback to full text if no sentences found
  const sentenceCount = sentences.length;

  // Calculate average sentence length (chars) - handle potential division by zero
  const totalLength = sentences.reduce((sum, s) => sum + s.trim().length, 0);
  const avgSentenceLength = sentenceCount > 0 ? totalLength / sentenceCount : 0;
  
  // Calculate legal terminology density
  const legalTerms = [
    'pursuant to', 'hereinafter', 'aforementioned', 'notwithstanding',
    'whereby', 'heretofore', 'hereof', 'thereto', 'thereby',
    'indemnify', 'liability', 'jurisdiction', 'arbitration', 'whereas',
    'force majeure', 'governing law', 'severability', 'confidentiality'
    // Add more legal terms
  ];
  
  let legalTermCount = 0;
  legalTerms.forEach(term => {
    const regex = new RegExp(`\\b${term}\\b`, 'gi'); // Use word boundaries
    const matches = text.match(regex);
    legalTermCount += matches ? matches.length : 0;
  });
  
  // Calculate density per 1000 characters - handle potential division by zero
  const textLengthThousands = text.length / 1000;
  const legalDensity = textLengthThousands > 0 ? legalTermCount / textLengthThousands : 0; 
  
  const score = calculateComplexityScore(avgSentenceLength, legalDensity);

  return {
    avgSentenceLength,
    legalDensity, 
    complexity: score
  };
}

/**
 * Calculates a numerical complexity score based on text metrics
 */
function calculateComplexityScore(avgSentenceLength, legalDensity) {
  // Normalize and weight the factors (adjust weights as needed)
  // Assume avg sentence length around 100 chars is normal, legal density > 5 is high
  const lengthScore = Math.max(0, Math.min(1, (avgSentenceLength - 50) / 150)); // Normalize 0-1 roughly for 50-200 char sentences
  const densityScore = Math.max(0, Math.min(1, legalDensity / 10)); // Normalize 0-1 roughly for 0-10 density
  
  // Weighted score (e.g., 60% length, 40% density)
  const weightedScore = (lengthScore * 0.6) + (densityScore * 0.4);
  
  // Scale to 0-100
  return weightedScore * 100;
}

/**
 * Determines optimal chunking parameters based on document analysis
 */
function calculateChunkParameters(docLength, docType, complexity) {
  let baseChunkSize = 1000; // Default baseline
  let chunkOverlap = 200;  // Default overlap
  let splitByHeadings = false;
  
  // Adjust based on document type
  switch (docType) {
    case 'legal_contract':
      baseChunkSize = 800; // Smaller chunks for dense legal text
      chunkOverlap = 250;  // Higher overlap for legal context
      splitByHeadings = true; // Legal docs often have clear section headings
      break;
    case 'financial_report':
      baseChunkSize = 1200; // Financial docs may have tables that need context
      chunkOverlap = 200;
      break;
    case 'medical_record':
      baseChunkSize = 900;
      chunkOverlap = 180;
      break;
    default: // 'general'
      baseChunkSize = 1000;
      chunkOverlap = 200;
  }
  
  // Further adjust based on document length
  if (docLength > 100000) { // Very long document ( > 100k chars)
    baseChunkSize = Math.min(baseChunkSize * 1.2, 1500); // Slightly larger chunks but cap at 1500
  } else if (docLength < 10000) { // Short document ( < 10k chars)
    baseChunkSize = Math.max(baseChunkSize * 0.8, 500); // Smaller chunks but not below 500
  }
  
  // Adjust based on complexity score (0-100)
  if (complexity.complexity > 75) { // High complexity
    baseChunkSize = Math.max(baseChunkSize * 0.75, 600); // Reduce chunk size significantly for complex texts
    chunkOverlap = Math.min(chunkOverlap * 1.25, baseChunkSize * 0.4); // Increase overlap, capped at 40%
  } else if (complexity.complexity < 25) { // Low complexity
    baseChunkSize = Math.min(baseChunkSize * 1.15, 1800); // Slightly larger chunks for simpler texts
    chunkOverlap = Math.max(chunkOverlap * 0.85, 100); // Less overlap needed, min 100
  }
  
  // Ensure overlap is never larger than chunk size - 100
  chunkOverlap = Math.min(chunkOverlap, baseChunkSize - 100);
  chunkOverlap = Math.max(chunkOverlap, 50); // Ensure minimum overlap

  return {
    chunkSize: Math.round(baseChunkSize),
    chunkOverlap: Math.round(chunkOverlap),
    splitByHeadings
  };
}

/**
 * Splits text into chunks based on section headings (Improved Regex)
 */
function splitByDocumentHeadings(text, maxChunkSize, overlap) {
  // Regex pattern for common document headings (more robust)
  // Matches lines starting with Roman numerals, numbers (e.g., 1., 1.1, 1.1.1), or uppercase letters followed by a period/parenthesis,
  // followed by mostly uppercase or title-case text.
  const headingRegex = /^(?:[IVXLCDM]+\.|[A-Z]\.|\(\s*[a-zA-Z]\s*\)|\d+(?:\.\d+)*\.?)\s+([A-Z][A-Za-z0-9\s\-()&',]{3,})/gm;

  const chunks = [];
  let lastIndex = 0;
  let match;

  while ((match = headingRegex.exec(text)) !== null) {
    // Get the text between the last heading and this one
    const sectionText = text.substring(lastIndex, match.index);
    if (sectionText.trim().length > 0) {
       // If the section is too large, split it further by size
      if (sectionText.length > maxChunkSize * 1.5) { // Use a multiplier to allow slightly larger heading sections
         const subChunks = splitBySize(sectionText, maxChunkSize, overlap);
         chunks.push(...subChunks);
      } else {
         chunks.push(sectionText.trim());
      }
    }
    lastIndex = match.index; // Update lastIndex to the start of the current heading
  }

  // Add the last section (from the last heading to the end)
  const lastSectionText = text.substring(lastIndex);
   if (lastSectionText.trim().length > 0) {
      if (lastSectionText.length > maxChunkSize * 1.5) {
         const subChunks = splitBySize(lastSectionText, maxChunkSize, overlap);
         chunks.push(...subChunks);
      } else {
         chunks.push(lastSectionText.trim());
      }
   }

  // If splitting by headings resulted in very few chunks (e.g., < 3 for a reasonably long doc),
  // it might indicate poor heading detection; fall back to size-based chunking.
  if (chunks.length < 3 && text.length > maxChunkSize * 3) {
     console.log("[Adaptive Chunking] Heading-based splitting produced too few chunks. Falling back to size-based splitting.");
     return splitBySize(text, maxChunkSize, overlap);
  }

  return chunks.filter(chunk => chunk.length > 0); // Ensure no empty chunks
}


/**
 * Splits text into overlapping chunks of specified size, trying to respect sentence boundaries.
 */
function splitBySize(text, chunkSize, overlap) {
  const chunks = [];
  const minChunkSize = Math.max(50, overlap); // Minimum size to make overlap meaningful

  let currentPos = 0;
  while (currentPos < text.length) {
    let endPos = Math.min(currentPos + chunkSize, text.length);
    let actualEndPos = endPos;

    // If we are not at the end of the text, try to find a sentence boundary near the end position
    if (endPos < text.length) {
      let bestBoundary = -1;
      // Search backward from endPos for sentence-ending punctuation followed by space or newline
      for (let i = endPos; i > currentPos + minChunkSize; i--) {
        if (/[.!?]/.test(text[i]) && /\s/.test(text[i + 1])) {
          bestBoundary = i + 1; // Include the punctuation
          break;
        }
      }
       // If no sentence end found, look for paragraph breaks (double newline)
      if (bestBoundary === -1) {
         const lastDoubleNewline = text.lastIndexOf('\n\n', endPos);
         if (lastDoubleNewline > currentPos + minChunkSize) {
            bestBoundary = lastDoubleNewline + 2; // Include the newlines
         }
      }
      
       // If we found a boundary that results in a reasonable chunk size, use it
      if (bestBoundary !== -1 && bestBoundary > currentPos + minChunkSize) {
        actualEndPos = bestBoundary;
      }
      // If no good boundary found, stick with the original endPos
    }

    const chunk = text.substring(currentPos, actualEndPos).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Move to the next position, ensuring overlap
    // Ensure we make progress, especially if actualEndPos is small
    const nextStartPos = Math.min(text.length, Math.max(currentPos + minChunkSize, actualEndPos - overlap));
    
    // Prevent infinite loops if no progress is made
    if (nextStartPos <= currentPos) {
       currentPos = actualEndPos; // Force progress by jumping past the current chunk
    } else {
       currentPos = nextStartPos;
    }
  }

  return chunks.filter(chunk => chunk.length > 0); // Ensure no empty chunks
}


// Export the main function for use in the processing pipeline
export { adaptiveChunking };
