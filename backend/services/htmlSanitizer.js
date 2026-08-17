const sanitizeHtml = require('sanitize-html');

function sanitizeRichText(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: ['a', 'strong', 'b', 'em', 'i', 'u', 'span', 'br', 'p', 'ul', 'ol', 'li'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
      }),
    },
    disallowedTagsMode: 'discard',
  });
}

module.exports = { sanitizeRichText };
