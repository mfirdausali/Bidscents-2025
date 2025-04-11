
const fs = require('fs');
const path = require('path');

// Create client/public directory if it doesn't exist
const publicDir = path.join(__dirname, '../client/public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Copy the social preview image
const sourcePath = path.join(__dirname, '../attached_assets/bidscents-homepage.jpg');
const destPath = path.join(publicDir, 'social-preview.jpg');

fs.copyFile(sourcePath, destPath, (err) => {
  if (err) {
    console.error('Error copying social preview image:', err);
  } else {
    console.log('Social preview image prepared successfully');
  }
});
