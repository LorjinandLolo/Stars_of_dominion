// lib/time/notification-tests.ts
// npx tsx lib/time/notification-tests.ts
//
// The Next.js server's notification queue. The rule that matters: a note
// addressed to 'all' must reach every faction, so one faction's poll cannot
// consume it for the rest — /api/notifications is drained per caller.

import { fireNotification, drainNotifications, peekNotifications, getQueueLength } from './notification-hooks';
import type { GameNotification } from './time-types';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
    if (ok) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

let seq = 0;
const note = (factionId: string, title: string): GameNotification => ({
    id: `n-${++seq}`, factionId, category: 'military' as any, priority: 'normal' as any,
    title, body: title, createdAt: new Date(0).toISOString(), read: false,
});

const A = 'faction-a';
const B = 'faction-b';
const C = 'faction-c';

console.log('\n1. Targeted notes belong to one faction');
{
    drainNotifications();
    fireNotification(note(A, 'A ONLY'));
    fireNotification(note(B, 'B ONLY'));
    const forA = drainNotifications(A);
    check('a faction gets its own', forA.length === 1 && forA[0].title === 'A ONLY');
    check('and takes it off the queue', getQueueLength() === 1);
    check("another faction's note is untouched", drainNotifications(B).map(n => n.title).join() === 'B ONLY');
    check('the queue is empty once both collected', getQueueLength() === 0);
    check('a second drain returns nothing', drainNotifications(A).length === 0 && drainNotifications(B).length === 0);
}

console.log('\n2. A broadcast reaches every faction');
{
    drainNotifications();
    fireNotification(note('all', 'SEASON CLOSED'));
    check('the first faction to poll gets it', drainNotifications(A).map(n => n.title).join() === 'SEASON CLOSED');
    // This is the bug: the old drain deleted every match, so at most one of the
    // fourteen players ever saw a season close.
    check('and so does the second', drainNotifications(B).map(n => n.title).join() === 'SEASON CLOSED');
    check('and the third', drainNotifications(C).map(n => n.title).join() === 'SEASON CLOSED');
    check('but nobody gets it twice', drainNotifications(A).length === 0 && drainNotifications(B).length === 0);
    check('it stays queued for factions that have not polled', getQueueLength() === 1);
}

console.log('\n3. Mixed queue');
{
    drainNotifications();
    fireNotification(note('all', 'BROADCAST'));
    fireNotification(note(A, 'FOR A'));
    fireNotification(note(B, 'FOR B'));
    const forA = drainNotifications(A).map(n => n.title).sort().join();
    check('a faction gets its own plus the broadcast', forA === 'BROADCAST,FOR A', forA);
    check("and not the other faction's", !drainNotifications(A).length);
    const forB = drainNotifications(B).map(n => n.title).sort().join();
    check('the other faction still gets both of its own', forB === 'BROADCAST,FOR B', forB);
    check('only the broadcast is left', getQueueLength() === 1);
}

console.log('\n4. Peek changes nothing');
{
    drainNotifications();
    fireNotification(note('all', 'BROADCAST'));
    fireNotification(note(A, 'FOR A'));
    check('peek shows what a drain would return', peekNotifications(A).length === 2);
    check('twice', peekNotifications(A).length === 2);
    check('and did not mark the broadcast delivered', drainNotifications(A).length === 2);
    check('the drain did', peekNotifications(A).length === 0 && peekNotifications(B).length === 1);
}

console.log('\n5. No faction: the game loop drains the lot');
{
    drainNotifications();
    fireNotification(note('all', 'BROADCAST'));
    fireNotification(note(A, 'FOR A'));
    // scripts/game-loop.ts drains with no faction and does its own fan-out onto
    // every faction record, so this path has to empty the queue.
    check('everything comes back', drainNotifications().length === 2);
    check('and the queue is empty', getQueueLength() === 0);
    fireNotification(note('all', 'AFTER CLEAR'));
    check('delivery state was cleared with it', drainNotifications(A).length === 1 && drainNotifications(B).length === 1);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
