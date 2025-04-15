import { NextResponse } from 'next/server';
import { connectToDatabase } from '../../../lib/db/mongodb.js';
import Document from '../../../lib/db/models/Document.js';
import { v4 as uuidv4 } from 'uuid';

// Ensure database connection
async function ensureDbConnection() {
  await connectToDatabase();
}

/**
 * GET handler for documents
 * Returns a list of documents or a specific document by ID
 */
export async function GET(request) {
  try {
    // Connect to database
    await ensureDbConnection();
    
    // Get document ID from query params
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('id');
    
    if (documentId) {
      // Fetch a specific document by ID
      const document = await Document.findOne({ id: documentId });
      
      if (!document) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
      
      return NextResponse.json(document);
    } else {
      // Fetch all documents with pagination
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '10');
      const skip = (page - 1) * limit;
      
      const documents = await Document.find()
        .sort({ created: -1 })
        .skip(skip)
        .limit(limit);
      
      const total = await Document.countDocuments();
      
      return NextResponse.json({
        documents,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      });
    }
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST handler for creating new documents
 */
export async function POST(request) {
  try {
    // Connect to database
    await ensureDbConnection();
    
    // Parse request body
    const data = await request.json();
    
    // Validate required fields
    if (!data.title || !data.content) {
      return NextResponse.json(
        { error: 'Title and content are required fields' },
        { status: 400 }
      );
    }
    
    // Create a new document
    const newDocument = new Document({
      id: uuidv4(),
      title: data.title,
      content: data.content,
      summary: data.summary || '',
      tags: data.tags || [],
      sourceType: data.sourceType || 'pdf',
      metadata: data.metadata || {},
      jobId: data.jobId
    });
    
    // Save the document
    await newDocument.save();
    
    return NextResponse.json({
      message: 'Document created successfully',
      document: newDocument
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating document:', error);
    return NextResponse.json(
      { error: 'Failed to create document', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT handler for updating documents
 */
export async function PUT(request) {
  try {
    // Connect to database
    await ensureDbConnection();
    
    // Parse request body
    const data = await request.json();
    
    // Validate document ID
    if (!data.id) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }
    
    // Find the document
    const document = await Document.findOne({ id: data.id });
    
    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }
    
    // Update document fields
    if (data.title) document.title = data.title;
    if (data.content) document.content = data.content;
    if (data.summary !== undefined) document.summary = data.summary;
    if (data.tags) document.tags = data.tags;
    if (data.metadata) document.metadata = data.metadata;
    
    // Save the updated document
    await document.save();
    
    return NextResponse.json({
      message: 'Document updated successfully',
      document
    });
  } catch (error) {
    console.error('Error updating document:', error);
    return NextResponse.json(
      { error: 'Failed to update document', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE handler for removing documents
 */
export async function DELETE(request) {
  try {
    // Connect to database
    await ensureDbConnection();
    
    // Get document ID from query params
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('id');
    
    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }
    
    // Delete the document
    const result = await Document.deleteOne({ id: documentId });
    
    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json(
      { error: 'Failed to delete document', details: error.message },
      { status: 500 }
    );
  }
} 