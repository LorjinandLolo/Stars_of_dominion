// scripts/group-invite-probe.ts
// One link in a group chat: can everyone holding it sign up and pick their own
// empire, and does the host get in after a reseed without a code?
//
// lib/invites (invite-rules.ts pure, invite-service.ts against the local
// database). The DB half makes a throwaway host profile on a free empire and
// deletes everything it made at the end. The sign-up hook itself (lib/auth.ts)
// is exercised in the browser.
//
// Run:  npx tsx scripts/group-invite-probe.ts

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { prisma } from '../lib/db';
import { LOBBY_FACTIONS } from '../data/factions/lobby-factions';
import { checkInvite, isGroupInvite, GROUP_INVITE_MAX_USES } from '../lib/invites/invite-rules';
import {
    claimThroughInvite, createInvite, galaxyHasNoPlayers, inviteOpenForSignup, listInvites, previewInvite, reserveInvite,
} from '../lib/invites/invite-service';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (!ok) failures++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const HOST = 'probe-group-host';

async function main() {
    console.log('Rules');
    const later = new Date(Date.now() + 60_000);
    const group = { code: 'G', usedBy: null, expiresAt: later, maxUses: 3, uses: 0 };
    check('a group link is open to strangers', checkInvite(group, null).ok);
    check('it stays open after someone used it', checkInvite({ ...group, uses: 2, usedBy: 'someone' }, 'other').ok);
    const full = checkInvite({ ...group, uses: 3 }, null);
    check('it closes when full', !full.ok && full.reason === 'full');
    const expired = checkInvite({ ...group, expiresAt: new Date(Date.now() - 1) }, null);
    check('it closes when expired', !expired.ok && expired.reason === 'expired');
    const friend = checkInvite({ code: 'F', usedBy: 'a', expiresAt: later }, 'b');
    check('a friend link without maxUses is still single use', !friend.ok && friend.reason === 'used');
    check('old rows (maxUses absent or 1) are friend links', !isGroupInvite({}) && !isGroupInvite({ maxUses: 1 }));

    console.log('Database');
    const taken = new Set((await prisma.playerProfile.findMany({ select: { factionId: true } })).map(p => p.factionId));
    const free = LOBBY_FACTIONS.find(f => !taken.has(f.id));
    if (!free) { check('a free empire exists for the probe host', false); return; }
    const hadPlayers = taken.size > 0;
    check('galaxyHasNoPlayers matches the table', (await galaxyHasNoPlayers()) === !hadPlayers);

    await prisma.playerProfile.create({ data: { userId: HOST, factionId: free.id, displayName: 'Probe Host' } });
    try {
        check('with a claim the galaxy is no longer open', !(await galaxyHasNoPlayers()));

        const first = await createInvite(HOST, { group: true });
        check('a host with an empire can make a group link', first.ok);
        if (!first.ok) return;
        check('it is good for the group size', first.value.group?.maxUses === GROUP_INVITE_MAX_USES);

        const preview = await previewInvite(first.value.code);
        check('/join sees it as a group link', preview.valid && preview.group === true);
        check('sign-up through it is allowed', (await inviteOpenForSignup(first.value.code)).ok);

        await reserveInvite(first.value.code, 'probe-joiner-1');
        await reserveInvite(first.value.code, 'probe-joiner-2');
        const row = await prisma.invite.findUnique({ where: { code: first.value.code } });
        check('each sign-up counts, nobody owns it', row?.uses === 2 && row?.usedBy === null, `uses ${row?.uses}`);
        check('still open for the third friend', (await inviteOpenForSignup(first.value.code)).ok);

        const claim = await claimThroughInvite(first.value.code, 'probe-joiner-1', 'Joiner');
        check('it never assigns an empire (joiners pick from the list)', !claim.ok && claim.status === 400);

        const friendLink = await createInvite(HOST, {});
        check('friend links still work beside it', friendLink.ok && !friendLink.value.group);

        const second = await createInvite(HOST, { group: true });
        check('a new group link can be made', second.ok);
        const old = await inviteOpenForSignup(first.value.code);
        check('and it shuts the old one', !old.ok);
        const mine = await listInvites(HOST);
        check('the list shows group links with their count', mine.some(i => i.group && i.code === (second.ok ? second.value.code : '')));
    } finally {
        await prisma.invite.deleteMany({ where: { createdBy: HOST } });
        await prisma.playerProfile.deleteMany({ where: { userId: HOST } });
    }
}

main()
    .catch(err => { failures++; console.error(err); })
    .finally(async () => {
        await prisma.$disconnect();
        console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
        process.exit(failures ? 1 : 0);
    });
