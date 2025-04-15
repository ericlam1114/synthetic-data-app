import mongoose from 'mongoose';

const JobSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  status: {
    type: String,
    enum: ['initialized', 'downloading', 'extracting', 'processing', 'merging', 'completed', 'failed', 'timeout', 'resuming', 'restarting'],
    required: true,
    default: 'initialized'
  },
  message: {
    type: String,
    default: 'Job initialized'
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  fileKey: String,
  textKey: String,
  pipelineType: {
    type: String,
    enum: ['legal', 'qa', 'finance'],
    default: 'legal'
  },
  options: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  totalPages: Number,
  currentPage: Number,
  totalChunks: Number,
  currentChunk: Number,
  resultPaths: [String],
  outputKey: String,
  error: String,
  stats: mongoose.Schema.Types.Mixed,
  created: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  completed: Date,
  failed: Date,
  resumed: Date,
  restarted: Date
});

// Automatically update the lastUpdated date
JobSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Create a model using the schema
const Job = mongoose.models.Job || mongoose.model('Job', JobSchema);

export default Job; 