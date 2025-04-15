// scripts/test-mongodb-model.js
import { connectToDatabase, disconnectFromDatabase } from '../lib/db/mongodb.js';
import Job from '../lib/db/models/Job.js';
import { v4 as uuidv4 } from 'uuid';

async function testMongoDBModels() {
  try {
    console.log('Connecting to MongoDB...');
    await connectToDatabase();
    console.log('Connected successfully!');

    // 1. Create a new job
    const newJobId = uuidv4();
    const newJob = new Job({
      id: newJobId,
      status: 'initialized',
      message: 'Test job created',
      fileKey: 'test-file.pdf',
      pipelineType: 'legal'
    });

    // 2. Save the job to the database
    await newJob.save();
    console.log('Created new job:', newJobId);

    // 3. Find the job we just created
    const foundJob = await Job.findOne({ id: newJobId });
    console.log('Found job by ID:', foundJob.id);
    console.log('Job status:', foundJob.status);
    console.log('Job created at:', foundJob.created);

    // 4. Update the job
    foundJob.status = 'processing';
    foundJob.progress = 25;
    foundJob.message = 'Job is now processing';
    await foundJob.save();
    
    console.log('Updated job status to:', foundJob.status);
    console.log('Job lastUpdated timestamp updated to:', foundJob.lastUpdated);

    // 5. List all jobs
    const allJobs = await Job.find().sort({ created: -1 }).limit(5);
    console.log(`Found ${allJobs.length} total jobs. Most recent 5:`);
    
    allJobs.forEach((job, index) => {
      console.log(`${index + 1}. Job ID: ${job.id}, Status: ${job.status}, Created: ${job.created}`);
    });

    // 6. Delete the test job we created
    await Job.deleteOne({ id: newJobId });
    console.log('Deleted test job:', newJobId);

    // 7. Disconnect from database
    await disconnectFromDatabase();
    console.log('Test completed successfully!');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Ensure we disconnect even if there's an error
    try {
      await disconnectFromDatabase();
    } catch (e) {
      // Already disconnected
    }
    process.exit(0);
  }
}

testMongoDBModels(); 