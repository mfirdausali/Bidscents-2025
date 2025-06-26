import { fileSecurity } from './file-security';
import { uploadMonitor } from './file-upload-monitor';
import fs from 'fs/promises';
import path from 'path';

/**
 * Test file security implementation
 */
async function testFileSecurity() {
  console.log('🔒 Testing File Security Implementation\n');
  
  // Test 1: File signature validation
  console.log('1️⃣ Testing file signature validation:');
  
  // Create test image buffer (fake JPEG)
  const fakeJpegBuffer = Buffer.concat([
    Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), // JPEG header
    Buffer.from('fake image data')
  ]);
  
  const validJpeg = await fileSecurity.validateFileSignature(fakeJpegBuffer, 'image/jpeg');
  console.log('✓ Valid JPEG signature:', validJpeg);
  
  // Test invalid signature
  const invalidBuffer = Buffer.from('not an image');
  const invalidSignature = await fileSecurity.validateFileSignature(invalidBuffer, 'image/jpeg');
  console.log('✓ Invalid signature detected:', !invalidSignature);
  
  // Test 2: Filename sanitization
  console.log('\n2️⃣ Testing filename sanitization:');
  
  const dangerousFilenames = [
    '../../../etc/passwd',
    'file.exe',
    'script.js',
    '..\\windows\\system32\\config',
    'file with spaces.jpg',
    'файл.png', // Non-ASCII
    'a'.repeat(300) + '.jpg' // Very long
  ];
  
  dangerousFilenames.forEach(filename => {
    const sanitized = fileSecurity.sanitizeFilename(filename);
    console.log(`✓ "${filename}" → "${sanitized}"`);
  });
  
  // Test 3: File size validation
  console.log('\n3️⃣ Testing file size validation:');
  
  const fileSizes = [
    { size: 1024 * 1024, type: 'image/jpeg', expected: true },
    { size: 10 * 1024 * 1024, type: 'image/jpeg', expected: false },
    { size: 15 * 1024 * 1024, type: 'application/pdf', expected: false }
  ];
  
  fileSizes.forEach(({ size, type, expected }) => {
    const valid = fileSecurity.validateFileSize(size, type);
    console.log(`✓ ${type} ${size} bytes: ${valid === expected ? 'PASS' : 'FAIL'}`);
  });
  
  // Test 4: Secure filename generation
  console.log('\n4️⃣ Testing secure filename generation:');
  
  const originalFilenames = ['photo.jpg', 'document.pdf', 'archive.zip'];
  originalFilenames.forEach(filename => {
    const secure1 = fileSecurity.generateSecureFilename(filename, 123);
    const secure2 = fileSecurity.generateSecureFilename(filename, 123);
    console.log(`✓ "${filename}" → "${secure1}"`);
    console.log(`  Unique: ${secure1 !== secure2}`);
  });
  
  // Test 5: Comprehensive file validation
  console.log('\n5️⃣ Testing comprehensive file validation:');
  
  const testFile = {
    buffer: fakeJpegBuffer,
    filename: 'test-image.jpg',
    mimeType: 'image/jpeg'
  };
  
  const validation = await fileSecurity.validateFile(
    testFile.buffer,
    testFile.filename,
    testFile.mimeType,
    {
      maxFileSize: 5 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png']
    }
  );
  
  console.log('✓ Validation result:', validation);
}

/**
 * Test upload monitoring
 */
async function testUploadMonitoring() {
  console.log('\n\n📊 Testing Upload Monitoring\n');
  
  // Simulate upload events
  const uploadEvents = [
    // Normal uploads
    { userId: 1, filename: 'photo1.jpg', size: 1024 * 1024, mimeType: 'image/jpeg', success: true, duration: 150 },
    { userId: 1, filename: 'photo2.jpg', size: 2 * 1024 * 1024, mimeType: 'image/jpeg', success: true, duration: 200 },
    { userId: 2, filename: 'document.pdf', size: 5 * 1024 * 1024, mimeType: 'application/pdf', success: true, duration: 300 },
    
    // Failed uploads
    { userId: 3, filename: 'large.jpg', size: 20 * 1024 * 1024, mimeType: 'image/jpeg', success: false, error: 'File too large', duration: 50 },
    
    // Suspicious activity (many uploads from same user)
    ...Array(60).fill(null).map((_, i) => ({
      userId: 4,
      filename: `spam${i}.jpg`,
      size: 500 * 1024,
      mimeType: 'image/jpeg',
      success: true,
      duration: 100,
      hash: 'same-hash' // Same file uploaded multiple times
    }))
  ];
  
  // Track uploads
  console.log('📤 Simulating upload events...');
  uploadEvents.forEach(event => uploadMonitor.trackUpload(event));
  
  // Get metrics
  const metrics = uploadMonitor.getMetrics();
  console.log('\n📊 Current Metrics:');
  console.log(`Total uploads: ${metrics.totalUploads}`);
  console.log(`Failed uploads: ${metrics.failedUploads}`);
  console.log(`Average size: ${(metrics.averageSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Uploads by type:`, metrics.uploadsByType);
  console.log(`Suspicious activities detected: ${metrics.suspiciousActivity.length}`);
  
  if (metrics.suspiciousActivity.length > 0) {
    console.log('\n⚠️ Suspicious Activities:');
    metrics.suspiciousActivity.forEach(activity => {
      console.log(`- User ${activity.userId}: ${activity.reason}`);
      console.log(`  Details:`, activity.details);
    });
  }
  
  // Generate report
  console.log('\n📄 Generating Upload Report...');
  try {
    const report = await uploadMonitor.generateUploadReport('daily');
    console.log('Report Summary:', report.summary);
  } catch (error) {
    console.log('Note: Report generation requires database connection');
  }
}

/**
 * Example: Secure file upload flow
 */
async function demonstrateSecureUploadFlow() {
  console.log('\n\n🔐 Demonstrating Secure Upload Flow\n');
  
  // Step 1: Receive file
  console.log('Step 1: File received from client');
  const mockFile = {
    originalname: '../../../etc/passwd.jpg',
    mimetype: 'image/jpeg',
    buffer: Buffer.concat([
      Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]),
      Buffer.from('image data here')
    ]),
    size: 1024 * 1024
  };
  
  console.log(`Original filename: ${mockFile.originalname}`);
  console.log(`Declared type: ${mockFile.mimetype}`);
  console.log(`Size: ${mockFile.size} bytes`);
  
  // Step 2: Validate file
  console.log('\nStep 2: Validating file...');
  const validation = await fileSecurity.validateFile(
    mockFile.buffer,
    mockFile.originalname,
    mockFile.mimetype,
    {
      allowedMimeTypes: ['image/jpeg', 'image/png'],
      maxFileSize: 5 * 1024 * 1024,
      dimensions: {
        maxWidth: 2048,
        maxHeight: 2048,
        minWidth: 400,
        minHeight: 400
      }
    }
  );
  
  if (!validation.valid) {
    console.log(`❌ Validation failed: ${validation.error}`);
    return;
  }
  
  console.log(`✅ File validation passed`);
  console.log(`Sanitized filename: ${validation.sanitizedFilename}`);
  console.log(`File hash: ${validation.hash}`);
  
  // Step 3: Generate secure filename
  console.log('\nStep 3: Generating secure filename...');
  const secureFilename = fileSecurity.generateSecureFilename(
    validation.sanitizedFilename!,
    123 // User ID
  );
  console.log(`Secure filename: ${secureFilename}`);
  
  // Step 4: Process image (if applicable)
  console.log('\nStep 4: Processing image...');
  try {
    const processedBuffer = await fileSecurity.processImage(mockFile.buffer, {
      maxWidth: 1920,
      maxHeight: 1080,
      quality: 85,
      watermark: true,
      watermarkText: 'BidScents'
    });
    console.log(`✅ Image processed. New size: ${processedBuffer.length} bytes`);
  } catch (error) {
    console.log('Note: Image processing requires sharp library');
  }
  
  // Step 5: Track upload
  console.log('\nStep 5: Tracking upload...');
  uploadMonitor.trackUpload({
    userId: 123,
    filename: secureFilename,
    size: mockFile.size,
    mimeType: mockFile.mimetype,
    success: true,
    duration: 250,
    hash: validation.hash
  });
  console.log('✅ Upload tracked successfully');
  
  console.log('\n🎉 Secure upload flow completed!');
}

// Run tests
async function runAllTests() {
  try {
    await testFileSecurity();
    await testUploadMonitoring();
    await demonstrateSecureUploadFlow();
    
    console.log('\n\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Export for use in other modules
export { testFileSecurity, testUploadMonitoring, demonstrateSecureUploadFlow };

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}