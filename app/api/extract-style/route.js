// app/api/extract-style/route.js
import { NextResponse } from 'next/server';
import { extractStyleSample } from '../../utils/styleExtractor';

export async function POST(request) {
  try {
    const { styleFileKey } = await request.json();
    
    if (!styleFileKey) {
      return NextResponse.json({ error: 'No style file key provided' }, { status: 400 });
    }
    
    console.log(`Extracting style sample from: ${styleFileKey}`);
    
    // Extract the style sample text (max 1000 characters)
    const styleSample = await extractStyleSample(styleFileKey, 1000);
    
    // Return the extracted style sample
    return NextResponse.json({ styleSample });
    
  } catch (error) {
    console.error('Error extracting style sample:', error);
    return NextResponse.json(
      { error: 'Failed to extract style sample', details: error.message },
      { status: 500 }
    );
  }
}