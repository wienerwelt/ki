import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/utils/notificationNavigation.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { getNotificationTarget: target } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const url = '/career?partnerId=606ed5c8-25b9-4b36-9436-0f0cfd7a5bfd&entry=1a21aa68-f612-48ec-b576-3bef259743d6&mode=pending';
for (const role of ['admin', 'assistenz']) {
    assert.equal(target({ type: 'career_review', target_url: url }, role), url);
    for (const invalid of [null, undefined, '/radar', 'https://evil.invalid', '//evil.invalid', url + '&redirect=evil']) {
        assert.equal(target({ type: 'career_review', target_url: invalid }, role), '/career?mode=pending');
    }
}
for (const role of ['user', 'demo', undefined]) assert.equal(target({ type: 'career_review', target_url: url }, role), null);
assert.equal(target({ type: 'community_comment' }, 'user'), '/community');
assert.equal(target({ type: 'file_upload' }, 'user'), '/files');
assert.equal(target({ type: 'system_update_reload' }, 'admin'), null);
assert.equal(target({ type: 'unknown' }, 'admin'), null);
console.log('Notification navigation: tenant/entry links, manager roles, stale links and unsafe targets OK.');
