import mongoose from 'mongoose';

const DocumentSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  summary: String,
  tags: [String],
  sourceType: {
    type: String,
    enum: ['pdf', 'text', 'web', 'other'],
    default: 'pdf'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  jobId: {
    type: String,
    index: true
  },
  created: {
    type: Date,
    default: Date.now
  },
  updated: {
    type: Date,
    default: Date.now
  }
});

// Automatically update the updated date
DocumentSchema.pre('save', function(next) {
  this.updated = new Date();
  next();
});

// Create a model using the schema
const Document = mongoose.models.Document || mongoose.model('Document', DocumentSchema);

export default Document; 