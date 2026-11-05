import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdult, yearsOld, passwordHash, verifyPassword, constantTimeEquals, cookieValue } from '../src/server/security.js';
import { bytesToBase64, base64ToBytes } from '../src/server/db.js';
test('16+ cutoff and invalid dates', () => {
 assert.equal(isAdult('2000-05-20', new Date('2026-11-04T12:00:00Z')), true);
 assert.equal(isAdult('2010-11-04', new Date('2026-11-04T12:00:00Z')), true);
 assert.equal(isAdult('2010-11-05', new Date('2026-11-04T12:00:00Z')), false);
 assert.equal(isAdult('2007-02-30'), false);
 assert.equal(isAdult('not-a-date'), false);
});
test('password roundtrip with unique salts', async () => {
 const p = await passwordHash('P455w0rd-very-strong!');
 assert.equal(await verifyPassword('P455w0rd-very-strong!', p.hash, p.salt, p.iterations), true);
 assert.equal(await verifyPassword('wrong-password', p.hash, p.salt, p.iterations), false);
 assert.equal(constantTimeEquals('abc','abd'), false);
});
test('blob base64 roundtrip', () => {
 const bytes = Uint8Array.from({length:22000}, (_,i)=> i%256);
 assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});
test('cookie parser', () => assert.equal(cookieValue('hello=1; kn_session=xyz; theme=dark', 'kn_session'), 'xyz'));
