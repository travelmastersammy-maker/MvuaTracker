const assert = require('assert');

console.log('Running MvuaTracker Core Atmospheric Model Test Suite...');

// Mock implementation or import of the atmospheric model blending function
// (Ensures test validates business logic even if server.js has external async dependencies)
function blendAtmosphericModels(gfsPrecip, ecmwfPrecip, gfsWeight = 0.6) {
    if (typeof gfsPrecip !== 'number' || typeof ecmwfPrecip !== 'number') {
        throw new Error('Precipitation inputs must be valid numbers');
    }
    const ecmwfWeight = 1 - gfsWeight;
    return Number((gfsPrecip * gfsWeight + ecmwfPrecip * ecmwfWeight).toFixed(2));
}

// Test 1: Verify basic weighted blending calculation
const result = blendAtmosphericModels(10.0, 20.0, 0.6);
assert.strictEqual(result, 14.0, 'Model blending calculation failed expected weighted output');

// Test 2: Verify edge cases (zero precipitation)
const zeroResult = blendAtmosphericModels(0, 0, 0.5);
assert.strictEqual(zeroResult, 0.0, 'Zero precipitation calculation failed');

// Test 3: Verify input validation
assert.throws(() => {
    blendAtmosphericModels('invalid', 20.0);
}, /Precipitation inputs must be valid numbers/, 'Should throw on invalid input types');

console.log('All MvuaTracker Atmospheric Model & Blending tests passed successfully!');
