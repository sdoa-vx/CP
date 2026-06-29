const sharp = require('sharp');
sharp('SDOA.seal.svg')
  .resize(512, 512)
  .png()
  .toFile('extension/assets/seal.png')
  .then(() => console.log('Successfully generated seal.png'))
  .catch(err => console.error('Error generating png:', err));
