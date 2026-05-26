#!/usr/bin/env node

// The @OptimizedFunction Swift macro requires the ExpoModulesMacros compiler plugin to be
// wired into the Xcode project, which doesn't happen automatically in EAS managed builds.
// This script patches each usage site by:
//   1. Removing the @OptimizedFunction annotation
//   2. Replacing Function("name", macroFn()) with Function("name") { macroFn() }
//      so the closure overload is used instead of the OptimizedFunctionDescriptor overload.

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const nodeModules = path.join(__dirname, '..', 'node_modules');

// Known patches: files that use @OptimizedFunction and the corresponding Function() call
// that references the macro-generated peer. Add more entries if new packages use the macro.
const PATCHES = [
  {
    file: 'expo-crypto/ios/CryptoModule.swift',
    // Remove @OptimizedFunction annotation line
    find: /^(\s*)@OptimizedFunction\s*\n(\s*private func (\w+)\(.*\) -> \w+ \{)/gm,
    replace: '$2',
    // Also fix the Function("name", fn()) call to Function("name") { fn() }
    postProcess: (content) => {
      // Match: Function("randomUUID", randomUUID())
      // Replace with: Function("randomUUID") { UUID().uuidString.lowercased() }
      // Generic: replace Function("name", name()) with Function("name") { name() }
      return content.replace(
        /Function\("(\w+)",\s*(\w+)\(\)\)/g,
        'Function("$1") { $2() }'
      );
    },
  },
];

let patched = false;

for (const patch of PATCHES) {
  const filePath = path.join(nodeModules, patch.file);
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping (not found): ${patch.file}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  content = content.replace(patch.find, patch.replace);
  if (patch.postProcess) {
    content = patch.postProcess(content);
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Patched: ${patch.file}`);
    patched = true;
  } else {
    console.log(`Already clean (no changes): ${patch.file}`);
  }
}

// Catch-all: strip any remaining @OptimizedFunction annotations in other packages
try {
  const result = execSync(
    `grep -rn "@OptimizedFunction" "${nodeModules}" --include="*.swift" -l 2>/dev/null`,
    { encoding: 'utf8' }
  ).trim();

  if (result) {
    const files = result.split('\n').filter(Boolean).filter(
      (f) => !f.includes('expo-modules-core') && !f.includes('expo-modules-macros-plugin')
    );

    for (const file of files) {
      let content = fs.readFileSync(file, 'utf8');
      const stripped = content.replace(/^\s*@OptimizedFunction\s*\n/gm, '');
      if (stripped !== content) {
        fs.writeFileSync(file, stripped, 'utf8');
        console.log(`Stripped annotation: ${path.relative(nodeModules, file)}`);
        patched = true;
      }
    }
  }
} catch (e) {
  if (e.status !== 1) {
    console.error('Unexpected error in catch-all:', e.message);
  }
}

console.log(patched ? 'Patching complete.' : 'No patches needed.');
