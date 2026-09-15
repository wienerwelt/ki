const assert = require('node:assert/strict');
const path = require('path');
const { enrichArticleTags } = require('../utils/articleOemLogos');

const library = path.resolve('test-oem-library');
const files = new Set(['volkswagen.png', 'mercedes-benz.svg', 'citron.png', 'audi.png']);
const fileExists = filename => path.dirname(filename) === library && files.has(path.basename(filename));
const tags = [
    { name: 'Volkswagen', logo_url: null, category_name: 'vehicle-product_news' },
    { name: 'Mercedes-Benz', logo_url: null, category_name: 'vehicle-product_news' },
    { name: 'Citroën', logo_url: null, category_name: 'vehicle-product_news' },
    { name: 'Audi', logo_url: 'https://example.invalid/custom.svg', category_name: 'vehicle-product_news' },
    { name: 'Quelle', logo_url: null, category_name: 'fleet_news' },
    { name: 'Nicht vorhanden', logo_url: null, category_name: 'vehicle-product_news' },
    { name: '../Unbekannt', logo_url: null, category_name: 'vehicle-product_news' },
];
const results = enrichArticleTags(tags, library, fileExists);
assert.deepEqual(results.map(tag => tag.logo_url), [
    '/api/logos/volkswagen.png', '/api/logos/mercedes-benz.svg', '/api/logos/citron.png',
    'https://example.invalid/custom.svg', null, null, null,
]);
assert.equal(tags[0].logo_url, null, 'Do not persist changes or mutate source tags.');
assert.deepEqual(enrichArticleTags(null, library, fileExists), []);
assert.deepEqual(enrichArticleTags([{ name: '', logo_url: null, category_name: 'vehicle-product_news' }], library, fileExists),
    [{ name: '', logo_url: null, category_name: 'vehicle-product_news' }]);
console.log('OEM article logos: category scoping, existing library, uploaded priority, safe paths and missing logos OK.');
