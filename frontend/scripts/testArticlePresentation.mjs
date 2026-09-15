import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/utils/articlePresentation.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { normalizeArticleWhitespace, getArticleOemTags, getArticleOemLogoUrl } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const tidy = normalizeArticleWhitespace;
assert.equal(tidy(null), '');
assert.equal(tidy('  Artikel\r\n       von Stefanie Schumacher       '), 'Artikel\nvon Stefanie Schumacher');
assert.equal(tidy('Hallo    Welt     !'), 'Hallo Welt !');
assert.equal(tidy('Zwei  Leerzeichen   bleiben'), 'Zwei  Leerzeichen   bleiben');
assert.equal(tidy('Absatz 1\n\n\n\n\nAbsatz 2'), 'Absatz 1\n\nAbsatz 2');
assert.equal(tidy('Text\u00a0\u00a0\u00a0\u00a0Autor'), 'Text Autor');
assert.equal(tidy('Text\n   \t\n      Autor\n\n- Liste'), 'Text\n\nAutor\n\n- Liste');
assert.equal(tidy(tidy('Titel\n\n\n   Autor')), tidy('Titel\n\n\n   Autor'));

const tags = [
    { name: 'BMW', logo_url: '/logos/bmw.png', category_name: 'vehicle-product_news' },
    { name: 'Audi', logo_url: '/logos/audi.png', category_name: 'vehicle-product_news' },
    { name: 'audi', logo_url: '/logos/audi.png', category_name: 'vehicle-product_news' },
    { name: 'Quelle', logo_url: '/logos/quelle.png', category_name: 'fleet_news' },
    { name: 'Unbekannt', logo_url: '/logos/u.png' },
    { name: 'Ohne Logo', logo_url: null, category_name: 'vehicle-product_news' },
    { name: 'Leeres Logo', logo_url: ' ', category_name: 'vehicle-product_news' },
];
assert.deepEqual(getArticleOemTags(tags).map(tag => tag.name), ['Audi', 'BMW']);
assert.deepEqual(getArticleOemTags(null), []);
assert.equal(tags.length, 7, 'Source tags must not be mutated.');
const logo = getArticleOemLogoUrl;
assert.equal(logo('/logos/audi.png', url => url), '/api/logos/audi.png');
assert.equal(logo('/api/logos/audi.png', url => url), '/api/logos/audi.png');
assert.equal(logo('/api/logos/audi.png', url => 'https://dashboard.example/api' + url), 'https://dashboard.example/api/logos/audi.png');
assert.equal(logo('/logos/audi.png', url => 'http://localhost:5001' + url), 'http://localhost:5001/api/logos/audi.png');
assert.equal(logo('https://s3.example/logos/audi.png', url => url), 'https://s3.example/logos/audi.png');
assert.equal(logo('/directory_logos/audi.webp', url => url), '/directory_logos/audi.webp');
console.log('Article presentation: whitespace, paragraphs, authors and manufacturer badges OK.');
