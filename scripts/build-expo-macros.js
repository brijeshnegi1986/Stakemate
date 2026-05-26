#!/usr/bin/env node

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const pluginDir = path.join(__dirname, '..', 'node_modules/@expo/expo-modules-macros-plugin/apple');
const binaryDest = path.join(pluginDir, 'ExpoModulesMacros-tool');

// Skip if binary already exists (local dev — built by npm install of the package itself)
if (fs.existsSync(binaryDest)) {
  console.log('ExpoModulesMacros-tool already exists, skipping build.');
  process.exit(0);
}

try {
  execSync('swift build -c release --target ExpoModulesMacros', {
    stdio: 'inherit',
    cwd: pluginDir,
  });

  const builtBinary = path.join(pluginDir, '.build/arm64-apple-macosx/release/ExpoModulesMacros-tool');
  fs.copyFileSync(builtBinary, binaryDest);
  execSync('strip ExpoModulesMacros-tool', { stdio: 'inherit', cwd: pluginDir });
  console.log('ExpoModulesMacros-tool built successfully.');
} catch (error) {
  console.error('ExpoModulesMacros build failed:', error.message);
  process.exit(1);
}
