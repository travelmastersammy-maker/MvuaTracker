const assert = require('assert');
const { resolveWeatherLocation } = require('./utils/locations');
const {
    calibrateRainProbability,
    calibrateForecastProbabilities,
    isOfficialThunderstormWarning
} = require('./utils/rain-probability');

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

// 4. Rainfall-aware probability calibration
assert.strictEqual(calibrateRainProbability(100, 0), 0, 'Zero forecast rainfall should not display a rain probability');
assert.strictEqual(calibrateRainProbability(100, 0.8), 20, 'Light rainfall should result in a low adjusted probability');
assert.strictEqual(calibrateRainProbability(100, 3), 50, 'Moderate rainfall should increase the adjusted probability');
assert.strictEqual(calibrateRainProbability(100, 12), 95, 'Heavy rainfall should cap at 95% without an official storm warning');
assert.strictEqual(calibrateRainProbability(57, 12), 57, 'Calibration must not increase model probability');
assert.strictEqual(calibrateRainProbability(100, 2, true), 100, 'A matched official thunderstorm warning may raise a wet forecast period to 100%');
assert.strictEqual(calibrateRainProbability(100, 0, true), 0, 'A storm warning must not make a dry forecast period 100%');
assert.strictEqual(calibrateRainProbability(null, 2), null, 'Missing model probability must remain missing');
assert.strictEqual(calibrateRainProbability(100, null), 95, 'Missing rainfall amount should retain the model estimate but apply the normal ceiling');
assert.strictEqual(calibrateRainProbability(100, undefined), 95, 'Unavailable rainfall amount should retain the model estimate but apply the normal ceiling');
assert.strictEqual(isOfficialThunderstormWarning({ event: 'Thunderstorm Warning' }), true, 'Official thunderstorm warning should be recognized');
assert.strictEqual(isOfficialThunderstormWarning({ event: 'Heavy Rain Advisory' }), false, 'Rain-only advisory should not trigger the 100% exception');

const sampleForecast = {
    hourly: { time: ['2026-10-29T10:00', '2026-10-29T11:00'], precipitation_probability: [100, 100], precipitation: [0.2, 12] },
    daily: { time: ['2026-10-29'], precipitation_probability_max: [100], precipitation_sum: [12] }
};
calibrateForecastProbabilities(sampleForecast);
assert.deepStrictEqual(sampleForecast.hourly.precipitation_probability, [10, 95], 'Hourly values should be calibrated from hourly rainfall');
assert.deepStrictEqual(sampleForecast.hourly.precipitation_probability_raw, [100, 100], 'Raw hourly model values should remain available for transparency');
assert.deepStrictEqual(sampleForecast.daily.precipitation_probability_max, [95], 'Daily values should use the strongest hourly rain amount');
console.log('? Rainfall-aware calibration and storm-warning exception tests passed.');

console.log('----------------------------------------------------');
console.log('All MvuaTracker Test Suites Passed Successfully! ??');
console.log('----------------------------------------------------');
