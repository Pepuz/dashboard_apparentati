// Run with: node mobile-app/app.test.js
const assert = require('assert');
const app = require('./app.js');

assert.deepStrictEqual(
  app.parseLink('#url=https%3A%2F%2Fexample.supabase.co%2F&key=sb_publishable_abc'),
  { url: 'https://example.supabase.co', key: 'sb_publishable_abc' });
assert.strictEqual(app.parseLink(''), null);
assert.strictEqual(app.parseLink('#url=https%3A%2F%2Fexample.supabase.co&key=sb_secret_abc'), null);
assert.strictEqual(app.parseLink('#url=http%3A%2F%2Fexample.supabase.co&key=sb_publishable_abc'), null);

assert.strictEqual(app.escapeHtml('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;');

console.log('app.test.js: ok');
