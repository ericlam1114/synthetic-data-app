// app/api/process/route.js
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import getConfig from "next/config";
import { EnhancedMemoryManager } from "../../../lib/utils/enhancedMemoryManager";
import SyntheticDataPipeline from "../../lib/SyntheticDataPipeline";
import QASyntheticDataPipeline from "../../lib/QASyntheticDataPipeline";
import FinanceSyntheticDataPipeline from "../../lib/FinanceSyntheticDataPipeline";
import documentStorageService from "../../../lib/services/documentStorageService";
import { getPipelineConfig } from "../../../lib/config/pipelineConfig";
import jobQueue from "../../../lib/queue/jobQueue";
import { processDocumentInBackground } from "../../../lib/workers/documentProcessor";

// Get server-side config
const { serverRuntimeConfig } = getConfig();

// Initialize S3 client
const s3Client = new S3Client({
  region: serverRuntimeConfig.aws.region,
  credentials: {
    accessKeyId: serverRuntimeConfig.aws.accessKeyId,
    secretAccessKey: serverRuntimeConfig.aws.secretAccessKey,
  },
});

// Initialize memory manager
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
    } = requestData;

    if (!textKey) {
      return NextResponse.json({ error: "No text key provided" }, { status: 400 });
    }

    // Queue the document processing job
    const jobId = jobQueue.add(
      async (jobContext) => {
        // Process document in background
        return await processDocumentInBackground(
          textKey, 
          pipelineType, 
          {
            ...requestData,
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
          },
          jobContext
        );
      },
      { 
        textKey, 
        pipelineType, 
        type: 'document_processing'
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
