const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const boundaries = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/kenya-counties.geojson'), 'utf8'));

test('bundled Kenya county map contains 47 named polygon features', () => {
  assert.equal(boundaries.type, 'FeatureCollection');
  assert.equal(boundaries.features.length, 47);
  const names = boundaries.features.map(feature => feature.properties.shapeName);
  assert.equal(new Set(names).size, 47);
  assert.ok(names.includes('Nairobi'));
  assert.ok(names.includes('Tharaka'));
  assert.ok(names.includes('Nyeri'));
  assert.ok(boundaries.features.every(feature => ['Polygon', 'MultiPolygon'].includes(feature.geometry.type)));
});
