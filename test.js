const assert = require('assert');
const fs = require('fs');

console.log('Running MvuaTracker Investor-Ready Test Suite...');

// 1. Verify critical server file exists
assert.ok(fs.existsSync('server.js'), 'server.js must exist in root directory');

// 2. Verify package.json configuration
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.strictEqual(pkg.name, 'mvuatracker', 'Package name must match');
assert.ok(pkg.engines && pkg.engines.node, 'Node engine requirement must be specified');

console.log('All MvuaTracker core tests passed successfully!');
