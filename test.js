const assert = require('assert');
const { resolveWeatherLocation } = require('./utils/locations');

console.log('----------------------------------------------------');
console.log('Running MvuaTracker Comprehensive Test Suite (v1.1)...');
console.log('----------------------------------------------------');

// 1. Atmospheric Model Blending Logic Test
function blendAtmosphericModels(gfsPrecip, ecmwfPrecip, gfsWeight = 0.6) {
    if (typeof gfsPrecip !== 'number' || typeof ecmwfPrecip !== 'number' || isNaN(gfsPrecip) || isNaN(ecmwfPrecip)) {
        throw new Error('Precipitation inputs must be valid numbers');
    }
    const ecmwfWeight = 1 - gfsWeight;
    return Number((gfsPrecip * gfsWeight + ecmwfPrecip * ecmwfWeight).toFixed(2));
}

// Blending test 1
const blendResult = blendAtmosphericModels(10.0, 20.0, 0.6);
assert.strictEqual(blendResult, 14.0, 'Atmospheric model weighted blend failed');
console.log('? Atmospheric model blending test passed.');

// 2. Spatial Town Mapping & Fallback Tests
const directHub = resolveWeatherLocation('Mombasa');
assert.strictEqual(directHub.isDirectHub, true, 'Direct major hub lookup failed');
assert.strictEqual(directHub.matchedHub, 'Mombasa Coastal Hub', 'Incorrect major hub match');

const minorTown = resolveWeatherLocation('Kitengela');
assert.strictEqual(minorTown.isDirectHub, false, 'Minor town should map via parent hub');
assert.strictEqual(minorTown.matchedHub, 'Nairobi Hub', 'Kitengela should map to Nairobi Hub');
console.log('? Spatial minor-to-major town routing test passed.');

// 3. Error Handling & Validation Tests
assert.throws(() => {
    blendAtmosphericModels('invalid', 20.0);
}, /Precipitation inputs must be valid numbers/, 'Should throw on invalid blending input');

assert.throws(() => {
    resolveWeatherLocation(null);
}, /Location query must be a valid string/, 'Should throw on null location query');
console.log('? Error handling & input validation test passed.');

console.log('----------------------------------------------------');
console.log('All MvuaTracker Test Suites Passed Successfully! ??');
console.log('----------------------------------------------------');
