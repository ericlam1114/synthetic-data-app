// app/api/process/route.js
import { NextResponse } from "next/server";
import { EnhancedMemoryManager } from "../../../lib/utils/enhancedMemoryManager";
import documentQueue from "../../../lib/queue/documentQueue";

// Initialize memory manager directly without using getConfig()
const memoryManager = new EnhancedMemoryManager({
  enableLogging: true,
  enableAutoGC: true,
  onCriticalMemory: handleCriticalMemory,
});

// Start memory monitoring
memoryManager.startMonitoring();

// Handle critical memory situations by forcing GC
function handleCriticalMemory(heapUsedMB) {
  console.warn(
    `Critical memory situation detected: ${heapUsedMB}MB in use. Forcing GC and reducing batch sizes.`
  );
  memoryManager.forceGC();
}

export async function POST(request) {
  try {
    // Parse request with timeout to avoid hanging
    const requestPromise = request.json();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request parsing timeout")), 5000)
    );
    
    const requestData = await Promise.race([requestPromise, timeoutPromise]);

    const {
      textKey,
      pipelineType = "legal",
      outputFormat = "openai-jsonl",
      // Legal pipeline options
      classFilter = "all",
      prioritizeImportant = true,
      // Q&A pipeline options
      questionTypes = ["factual", "procedural", "critical-thinking"],
      difficultyLevels = ["basic", "intermediate", "advanced"],
      maxQuestionsPerSection = 5,
      orgStyleSample = null,
      // Finance pipeline options
      metricFilter = "all",
      generateProjections = true,
      projectionTypes = ["valuation", "growth", "profitability"],
      // Job options
      priority = 0,
      // --- Extract new options --- 
      orgContext = "", // Default to empty string if not provided
      formattingDirective = "balanced", // Default to balanced if not provided
      // ---------------------------
    } = requestData;

    if (!textKey) {
      return NextResponse.json({ error: "No text key provided" }, { status: 400 });
    }

    // Add job to queue using our document queue
    const jobId = await documentQueue.addJob(
      textKey, 
      pipelineType, 
      {
        outputFormat,
        // Pass all the existing parameters to ensure no functionality is lost
        classFilter,
        prioritizeImportant,
        questionTypes,
        difficultyLevels,
        maxQuestionsPerSection,
        orgStyleSample,
        metricFilter,
        generateProjections,
        projectionTypes,
        priority,
        // --- Pass new options to the job --- 
        orgContext,
        formattingDirective,
        // -----------------------------------
      }
    );
    
    // Return job ID immediately
    return NextResponse.json({ 
      jobId,
      message: 'Document processing started in background',
      status: 'processing',
      pollUrl: `/api/jobs/status?id=${jobId}`
    });
    
  } catch (error) {
    console.error("Error in process API:", error);
    return NextResponse.json(
      { error: "Failed to process document", details: error.message },
      { status: 500 }
    );
  }
}