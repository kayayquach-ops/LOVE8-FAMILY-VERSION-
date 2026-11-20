// Kiểm thử Mây nối người (server/may.ts): tìm người nhận từ lời kể, xếp tín hiệu vào hàng chờ với hạn đúng loại,
// rồi gửi lời nhắc đúng người đúng giờ có trần, bấm là gọi, đo lời nhắc dẫn tới liên lạc.
// Không cần DB, không gọi mạng (DB giả theo từng câu trong MAY_SQL). Chạy: node --import tsx --test server/may.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Pending } from './may.ts';

const M = await import('./may.ts');
const { langMiddleware } = await import('./i18n.ts');
const express = (await import('express')).default;

// Nhà bốn người: bố Hùng, mẹ Lan, hai con An và Bình. Mặc định ở Hà Nội, ai cũng bật "Mây nhắc mình liên lạc".
const hung = { id: 'hung', name: 'Hùng', role: 'bo' }, lan = { id: 'lan', name: 'Lan', role: 'me' };
const an = { id: 'an', name: 'Nguyễn Văn An', role: 'con' }, binh = { id: 'binh', name: 'Bình', role: 'con' };
const family = [hung, lan, an, binh];
const members = family.map((m) => ({ ...m, city: 'hanoi', may_nudge: true }));
const lanM = members.find((m) => m.id === lan.id)!;

test('người nhận: tên khớp đúng một người, theo vai thì mọi người đúng vai, mơ hồ thì không ai', () => {
  const ids = (t: string, from = lan, fam = family) => M.resolveTargets(t, from, fam).sort();
  assert.deepEqual(ids('An'), [an.id]);
  assert.deepEqual(ids('bé An'), [an.id]);
  assert.deepEqual(ids('Anh'), []);                       // không khớp một phần tên
  assert.deepEqual(ids('các con'), [an.id, binh.id].sort());
  assert.deepEqual(ids('con'), []);                       // hai con: "con" mơ hồ
  assert.deepEqual(ids('con', lan, family.filter((m) => m.id !== binh.id)), [an.id]);
  assert.deepEqual(ids('bố'), [hung.id]);
  assert.deepEqual(ids('mẹ'), []);                        // người kể là mẹ: không tự gửi cho mình
  assert.deepEqual(ids('bố mẹ', an), [hung.id, lan.id].sort());
  assert.deepEqual(ids('An', lan, [...family, { id: 'an2', name: 'Trần An', role: 'con' }]), []);
  assert.deepEqual(ids(''), []);
  assert.deepEqual(ids('Minh'), []);
});

test('hàng chờ: hạn theo loại, gửi đúng người, tắt công tắc thì không, upcoming nhắc trước một hôm theo giờ người nhận', () => {
  const now = new Date('2026-11-20T03:00:00Z');
  const sig = (kind: string, target = '', date: any = null) => ({ kind, target, evidence: 'e', date });
  const plan = (signals: any[], fam = members, speaker = lanM) => M.planSignals({ familyId: 'F', callId: 'c1', speaker, family: fam, signals, now });
  const miss = plan([sig('miss', 'An')]);
  assert.deepEqual(miss.map((r) => [r.to_id, r.kind]), [[an.id, 'miss']]);
  assert.equal(miss[0].expires_at.toISOString(), '2026-11-21T03:00:00.000Z');
  assert.deepEqual(plan([sig('good_news')]).map((r) => r.to_id).sort(), [hung.id, an.id, binh.id].sort());
  assert.equal(plan([sig('good_news')])[0].expires_at.toISOString(), '2026-11-22T03:00:00.000Z');
  assert.deepEqual(plan([sig('good_news')], members.map((m) => (m.id === binh.id ? { ...m, may_nudge: false } : m))).map((r) => r.to_id).sort(), [hung.id, an.id].sort());
  assert.deepEqual(plan([sig('miss', 'An')], members, { ...lanM, may_nudge: false }), []);
  assert.deepEqual(plan([sig('worry', 'An')]), []);       // worry chỉ vào sổ nhớ, không thành lời nhắc
  assert.equal(plan([sig('miss', 'An'), sig('miss', 'An')]).length, 1);
  const kst = members.map((m) => ({ ...m, city: 'seoul' }));
  const up = plan([sig('upcoming', '', { day: 25, month: 11 })], kst).find((r) => r.to_id === an.id)!;
  assert.equal(up.due_at.toISOString(), '2026-11-24T00:00:00.000Z');      // 9:00 KST hôm trước
  assert.equal(up.expires_at.toISOString(), '2026-11-24T15:00:00.000Z');  // hết ngày hôm trước
  const soon = plan([sig('upcoming', '', { day: 21, month: 11 })], kst).find((r) => r.to_id === an.id)!;
  assert.equal(soon.due_at.toISOString(), now.toISOString());
  assert.deepEqual(plan([sig('upcoming', '', { day: 20, month: 11 })], kst), []); // hôm trước đã qua
  assert.deepEqual(plan([sig('upcoming', '', { day: 31, month: 2 })], kst), []);  // ngày không có thật
});

// ---------- Gửi lời nhắc ----------

test('khung giờ: 9:00 tới trước 21:30 giờ người nhận; múi giờ hỏng thì theo giờ Việt Nam, không lỗi', () => {
  assert.equal(M.inWindow('Asia/Ho_Chi_Minh', new Date('2026-11-20T01:59:00Z')), false);
  assert.equal(M.inWindow('Asia/Ho_Chi_Minh', new Date('2026-11-20T02:00:00Z')), true);
  assert.equal(M.inWindow('Asia/Ho_Chi_Minh', new Date('2026-11-20T14:29:00Z')), true);
  assert.equal(M.inWindow('Asia/Ho_Chi_Minh', new Date('2026-11-20T14:30:00Z')), false);
  assert.equal(M.inWindow('Mars/Base', new Date('2026-11-20T03:00:00Z')), true);
});
// Ở cấp module: Task 8 dùng lại now và p.
const now = new Date('2026-11-20T13:00:00Z');        // 20:00 VN, 22:00 KST
const p = (id: string, o: Partial<Pending> = {}): Pending => ({ id, kind: 'miss', toId: 'an', fromId: 'lan', toTz: 'Asia/Ho_Chi_Minh',
  dueAt: new Date('2026-11-20T00:00:00Z'), expiresAt: new Date('2026-11-21T00:00:00Z'), createdAt: new Date('2026-11-20T01:00:00Z'), toOn: true, fromOn: true, ...o });
test('chọn lời nhắc: ưu tiên, trần ngày và tuần, giờ người nhận, hết hạn, công tắc, chưa tới hạn', () => {
  const run = (ps: Pending[], h = new Map<string, Date[]>()) => M.pickSends(ps, h, now);
  assert.deepEqual(run([p('a'), p('b', { kind: 'want_contact' })]).send.map((x) => x.id), ['b']);
  assert.deepEqual(run([p('a')], new Map([['an', [new Date('2026-11-20T03:00:00Z')]]])).send, []);       // đã có 1 hôm nay
  assert.deepEqual(run([p('a')], new Map([['an', ['2026-11-15', '2026-11-16', '2026-11-18'].map((d) => new Date(`${d}T03:00:00Z`))]])).send, []);
  assert.deepEqual(run([p('a', { toTz: 'Asia/Seoul' })]), { send: [], drop: [] });                      // 22:00 KST: chờ, không bỏ
  assert.deepEqual(run([p('a', { expiresAt: new Date('2026-11-20T12:00:00Z') })]).drop, [{ id: 'a', why: 'expired' }]);
  assert.deepEqual(run([p('a', { toOn: false })]).drop, [{ id: 'a', why: 'off' }]);
  assert.deepEqual(run([p('a', { fromOn: false })]).drop, [{ id: 'a', why: 'off' }]);
  assert.deepEqual(run([p('a', { dueAt: new Date('2026-11-21T00:00:00Z') })]), { send: [], drop: [] });
  assert.deepEqual(run([p('a'), p('c', { toId: 'binh' })]).send.map((x) => x.id).sort(), ['a', 'c']);
  // Thêm: hôm qua theo giờ người nhận thì không tính vào trần ngày; cùng loại thì tín hiệu cũ hơn trước.
  assert.deepEqual(run([p('a')], new Map([['an', [new Date('2026-11-19T17:30:00Z')]]])).send.map((x) => x.id), []); // 0:30 hôm nay giờ VN
  assert.deepEqual(run([p('a')], new Map([['an', [new Date('2026-11-19T16:30:00Z')]]])).send.map((x) => x.id), ['a']); // 23:30 hôm qua
  assert.deepEqual(run([p('a', { createdAt: new Date('2026-11-20T05:00:00Z') }), p('b')]).send.map((x) => x.id), ['b']);
});
test('chữ lời nhắc: lời của Mây, không trích chuyện riêng, gọi theo vai', () => {
  const lan = { id: 'lan', name: 'Lan', role: 'me' }, an = { id: 'an', name: 'An', role: 'con' }, binh = { id: 'binh', name: 'Bình', role: 'con' };
  assert.deepEqual(M.nudgeText('miss', 'vi', lan, an, 'Mây'), { title: 'Mây', body: 'An ơi, mẹ vừa kể với Mây là nhớ An lắm. Gọi cho mẹ một chút nhé.' });
  assert.equal(M.nudgeText('low', 'vi', lan, an, 'Mây').body, 'Dạo này mẹ hơi mệt, An hỏi thăm mẹ nhé.');
  assert.equal(M.nudgeText('good_news', 'vi', binh, lan, 'Mây').body, 'Bình có tin vui muốn khoe với cả nhà đấy, hỏi Bình xem nào.');
  assert.equal(M.nudgeText('upcoming', 'vi', lan, an, 'Mây').body, 'Mai mẹ có việc quan trọng, An gửi mẹ một lời chúc nhé.');
  assert.match(M.nudgeText('miss', 'en', lan, an, 'Mây').body, /Mom/);
  assert.doesNotMatch(M.nudgeText('miss', 'vi', lan, an, 'Mây').body, /[—–]/);
  // Thêm: bố mẹ nhắc con thì viết hoa chữ đầu; nhà đặt tên linh vật khác thì dùng tên ấy; tiếng Hàn gọi tên kèm 님, gọi vai thì không.
  assert.equal(M.nudgeText('good_news', 'vi', lan, an, 'Mây').body, 'Mẹ có tin vui muốn khoe với cả nhà đấy, hỏi mẹ xem nào.');
  assert.deepEqual(M.nudgeText('miss', 'vi', binh, lan, 'Bông'), { title: 'Bông', body: 'Lan ơi, Bình vừa kể với Bông là nhớ Lan lắm. Gọi cho Bình một chút nhé.' });
  assert.match(M.nudgeText('miss', 'ko', binh, lan, 'Mây').body, /Bình님/);
  assert.doesNotMatch(M.nudgeText('miss', 'ko', lan, an, 'Mây').body, /Lan|엄마님/);
  for (const k of ['miss', 'want_contact', 'low', 'good_news', 'upcoming'] as const) for (const l of ['vi', 'en', 'ko'] as const) {
    const t = M.nudgeText(k, l, lan, an, 'Mây');
    assert.doesNotMatch(t.body, /[{}—–]|nudge\./, `${k} ${l}`);
  }
});

// DB giả cho phần gửi: đúng từng câu trong MAY_SQL, điều kiện viết lại bằng JS (kể cả điều kiện "chưa gửi, chưa bỏ" của câu giành tín hiệu).
type Row = Record<string, any>;
const ago = (h: number) => new Date(now.getTime() - h * 3600e3);
const kin = (id: string, name: string, role: string, o: Row = {}): Row =>
  ({ id, family_id: 'F', name, role, city: 'hanoi', loc_share: false, loc_lat: null, loc_lon: null, loc_at: null, may_nudge: true, ...o });
const nudge = (id: string, from_id: string, to_id: string, sent_at: Date, o: Row = {}): Row =>
  ({ id, family_id: 'F', signal_id: null, from_id, to_id, kind: 'miss', sent_at, opened_at: null, contact_at: null, ...o });

function fakeDb(t: { members?: Row[]; signals?: Row[]; nudges?: Row[]; messages?: Row[] } = {}) {
  const S = M.MAY_SQL;
  const families = [{ id: 'F', mascot_name: null }];
  const db = {
    members: t.members ?? [], signals: t.signals ?? [], nudges: t.nudges ?? [], messages: t.messages ?? [],
    async query(q: string, v: any[] = []): Promise<{ rows: Row[]; rowCount: number }> {
      const out = (rows: Row[], n = rows.length) => ({ rows, rowCount: n });
      const inFam = (id: string, fid: string) => db.members.some((m) => m.id === id && m.family_id === fid);
      switch (q) {
        case S.openNudges: return out(db.nudges.filter((n) => n.contact_at == null && +n.sent_at > +v[0]));
        case S.dms: return out(db.messages.filter((m) => v[0].includes(m.family_id) && m.to_id != null && +m.created_at >= +v[1]));
        case S.contact: {
          const n = db.nudges.find((x) => x.id === v[0] && x.contact_at == null);
          if (n) n.contact_at = v[1];
          return out([], n ? 1 : 0);
        }
        case S.markContact: {
          const [fid, at, since, all, fresh] = v;
          const hit = db.nudges.filter((n) => n.family_id === fid && n.contact_at == null && +n.sent_at > +since && all.includes(n.from_id) && all.includes(n.to_id)
            && (fresh.includes(n.from_id) || fresh.includes(n.to_id)));
          for (const n of hit) n.contact_at = at;
          return out([], hit.length);
        }
        case S.pending:
          return out(db.signals.filter((s) => s.sent_at == null && s.dropped == null).flatMap((s) => {
            const to = db.members.find((m) => m.id === s.to_id && m.family_id === s.family_id);
            const from = db.members.find((m) => m.id === s.from_id && m.family_id === s.family_id);
            const fam = families.find((f) => f.id === s.family_id);
            if (!to || !from || !fam) return [];
            return [{ id: s.id, family_id: s.family_id, kind: s.kind, from_id: s.from_id, to_id: s.to_id, due_at: s.due_at, expires_at: s.expires_at, created_at: s.created_at,
              to_name: to.name, to_role: to.role, city: to.city, loc_share: to.loc_share, loc_lat: to.loc_lat, loc_lon: to.loc_lon, loc_at: to.loc_at, to_on: to.may_nudge,
              from_name: from.name, from_role: from.role, from_on: from.may_nudge, mascot_name: fam.mascot_name }];
          }));
        case S.history: return out(db.nudges.filter((n) => v[0].includes(n.to_id) && +n.sent_at > +v[1]).map((n) => ({ to_id: n.to_id, sent_at: n.sent_at })));
        case S.drop: {
          const s = db.signals.find((x) => x.id === v[0] && x.sent_at == null && x.dropped == null);
          if (s) s.dropped = v[1];
          return out([], s ? 1 : 0);
        }
        case S.claimNudge: {
          // Một câu: giành tín hiệu (chỉ khi chưa gửi, chưa bỏ) và ghi lời nhắc từ chính hàng vừa giành.
          const s = db.signals.find((x) => x.id === v[0] && x.sent_at == null && x.dropped == null);
          if (!s) return out([]);
          s.sent_at = v[1];
          db.nudges.push({ id: v[2], family_id: s.family_id, signal_id: s.id, from_id: s.from_id, to_id: s.to_id, kind: s.kind, sent_at: s.sent_at, opened_at: null, contact_at: null });
          return out([{ id: v[2] }]);
        }
        case S.open: {
          const n = db.nudges.find((x) => x.id === v[0] && x.to_id === v[1] && x.family_id === v[2] && inFam(x.to_id, v[2]) && inFam(x.from_id, v[2]));
          if (n) n.opened_at ??= new Date();
          return out(n ? [{ from_id: n.from_id }] : []);
        }
      }
      throw new Error(`DB giả chưa biết câu này: ${q}`);
    },
  };
  return db;
}

test('khép vòng: gọi được cho nhau trong 48 giờ, kể cả người vào sau trong cuộc gọi nhóm; nhắn riêng cũng tính', async () => {
  // n1 lan→an gửi 10 giờ trước, n2 lan→an 50 giờ trước, n3 lan→binh 1 giờ trước, n4 hung→an 1 giờ trước
  const db = fakeDb({ nudges: [nudge('n1', 'lan', 'an', ago(10)), nudge('n2', 'lan', 'an', ago(50)), nudge('n3', 'lan', 'binh', ago(1)), nudge('n4', 'hung', 'an', ago(1))] });
  assert.equal(await M.markContact(db, 'F', ['an'], ['an', 'lan'], now), 1);              // n1
  assert.equal(await M.markContact(db, 'F', ['binh'], ['an', 'lan', 'binh'], now), 1);     // n3, người vào sau
  assert.equal(db.nudges.find((n) => n.id === 'n2')!.contact_at, null);
  assert.equal(db.nudges.find((n) => n.id === 'n4')!.contact_at, null);
  assert.deepEqual(M.contactFromMessages(
    [{ id: 'n1', from_id: 'lan', to_id: 'an', sent_at: new Date('2026-11-20T00:00:00Z') }],
    [{ author_id: 'an', to_id: 'lan', created_at: new Date('2026-11-21T01:00:00Z') }, { author_id: 'an', to_id: 'lan', created_at: new Date('2026-11-23T00:00:00Z') }]),
    [{ id: 'n1', at: new Date('2026-11-21T01:00:00Z') }]);
  // Thêm: người kể nhắn trước cũng là liên lạc; tin của người khác hay tin trước lúc nhắc thì không.
  assert.deepEqual(M.contactFromMessages(
    [{ id: 'n1', from_id: 'lan', to_id: 'an', sent_at: new Date('2026-11-20T00:00:00Z') }],
    [{ author_id: 'binh', to_id: 'an', created_at: new Date('2026-11-20T01:00:00Z') }, { author_id: 'an', to_id: 'lan', created_at: new Date('2026-11-19T23:00:00Z') },
      { author_id: 'lan', to_id: 'an', created_at: new Date('2026-11-20T05:00:00Z') }]),
    [{ id: 'n1', at: new Date('2026-11-20T05:00:00Z') }]);
});

test('một lượt gửi: báo đúng người, ghi lời nhắc, chạy hai lượt cùng lúc vẫn chỉ gửi một lần', async () => {
  // DB giả: một tín hiệu miss lan → an còn hạn, An ở Hà Nội (20:00 lúc chạy).
  const db = fakeDb({
    members: [kin('lan', 'Lan', 'me'), kin('an', 'An', 'con')],
    signals: [{ id: 's1', family_id: 'F', from_id: 'lan', to_id: 'an', kind: 'miss', evidence: 'Mẹ nhớ An, chuyện bí mật', due_at: ago(2), expires_at: ago(-22), created_at: ago(2), sent_at: null, dropped: null }],
  });
  const sent: Array<{ ids: string[]; payload: (l: 'vi' | 'en' | 'ko') => any }> = [];
  const deps = { db, notify: (ids: string[], payload: (l: 'vi' | 'en' | 'ko') => any) => sent.push({ ids, payload }), now: () => now };
  await Promise.all([M.mayTick(deps), M.mayTick(deps)]);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].ids, ['an']);
  const payload = sent[0].payload('vi');
  assert.equal(payload.kind, 'may'); assert.equal(payload.open, `may:${db.nudges[0].id}`);
  assert.equal(db.nudges.length, 1); assert.ok(db.signals[0].sent_at);
  // Thêm: đúng chữ, thẻ và hạn; không bao giờ có câu gốc trong thông báo; lượt sau không gửi lại.
  assert.deepEqual(payload, { kind: 'may', title: 'Mây', body: 'An ơi, mẹ vừa kể với Mây là nhớ An lắm. Gọi cho mẹ một chút nhé.',
    tag: `may-${db.nudges[0].id}`, open: `may:${db.nudges[0].id}`, ttl: 12 * 3600 });
  for (const l of ['vi', 'en', 'ko'] as const) assert.doesNotMatch(JSON.stringify(sent[0].payload(l)), /bí mật/);
  assert.deepEqual(db.nudges.map((n) => [n.signal_id, n.from_id, n.to_id, n.kind]), [['s1', 'lan', 'an', 'miss']]);
  assert.deepEqual(await M.mayTick(deps), { sent: 0, dropped: 0 });
});

test('hai lượt chồng nhau, lượt trước còn kẹt ở câu giành tín hiệu: người nhận vẫn chỉ một lời nhắc trong ngày', async () => {
  // Hai tín hiệu cho An: bố muốn gọi (ưu tiên hơn), mẹ nhớ. Lượt A kẹt ở câu giành tín hiệu tới khi lượt B chạy xong.
  const sig = (id: string, from_id: string, kind: string): Row => ({ id, family_id: 'F', from_id, to_id: 'an', kind, evidence: '', due_at: ago(2), expires_at: ago(-20), created_at: ago(2), sent_at: null, dropped: null });
  const db = fakeDb({ members: [kin('lan', 'Lan', 'me'), kin('hung', 'Hùng', 'bo'), kin('an', 'An', 'con')], signals: [sig('s1', 'hung', 'want_contact'), sig('s2', 'lan', 'miss')] });
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  const slow = { query: async (q: string, v?: any[]) => { if (q === M.MAY_SQL.claimNudge) await held; return db.query(q, v); } };
  const sent: string[] = [];
  const notify = (ids: string[]) => { sent.push(ids[0]); };
  const a = M.mayTick({ db: slow, notify, now: () => now });
  await new Promise((r) => setTimeout(r, 10));
  await M.mayTick({ db, notify, now: () => now });
  release();
  await a;
  assert.deepEqual(sent, ['an']);
  assert.deepEqual(db.nudges.map((n) => n.signal_id), ['s1']);
  assert.equal(db.signals.find((x) => x.id === 's2')!.sent_at, null);       // còn chờ, mai mới tới lượt
});

test('bộ hẹn giờ: lượt trước chưa xong thì lượt sau bỏ qua, xong rồi thì chạy tiếp; lỗi chỉ ghi log', async (t) => {
  let runs = 0;
  const gates: Array<() => void> = [];
  const openAll = () => gates.splice(0).forEach((g) => g());
  const run = M.oneAtATime(async () => { runs++; await new Promise<void>((r) => gates.push(r)); return { sent: 0, dropped: 0 }; });
  const first = run(), second = run();           // lượt thứ hai chồng lên lượt đầu: bỏ qua
  assert.equal(runs, 1);
  openAll();
  await Promise.all([first, second]);
  const again = run();                           // lượt trước xong rồi: chạy
  assert.equal(runs, 2);
  openAll();
  await again;
  const err = t.mock.method(console, 'error', () => {});
  const broken = M.oneAtATime(async () => { runs++; throw new Error('DB sập'); });
  await broken();                                // không ném ra ngoài
  await broken();                                // lỗi xong thì cờ đã gỡ: chạy lại được
  assert.equal(runs, 4);
  assert.equal(err.mock.callCount(), 2);
});

test('một lượt gửi: bỏ tín hiệu hết hạn hay đã tắt công tắc, khép vòng bằng tin nhắn riêng', async () => {
  const db = fakeDb({
    members: [kin('lan', 'Lan', 'me'), kin('an', 'An', 'con'), kin('binh', 'Bình', 'con', { may_nudge: false })],
    signals: [
      { id: 'old', family_id: 'F', from_id: 'lan', to_id: 'an', kind: 'miss', evidence: '', due_at: ago(30), expires_at: ago(6), created_at: ago(30), sent_at: null, dropped: null },
      { id: 'off', family_id: 'F', from_id: 'lan', to_id: 'binh', kind: 'low', evidence: '', due_at: ago(1), expires_at: ago(-40), created_at: ago(1), sent_at: null, dropped: null },
    ],
    // Lời nhắc hôm qua lan → an, An nhắn riêng cho mẹ 3 giờ sau; tin cả nhà không tính.
    nudges: [nudge('n0', 'lan', 'an', ago(30))],
    messages: [{ family_id: 'F', author_id: 'an', to_id: null, created_at: ago(29) }, { family_id: 'F', author_id: 'an', to_id: 'lan', created_at: ago(27) }],
  });
  const sent: unknown[] = [];
  assert.deepEqual(await M.mayTick({ db, notify: (ids) => sent.push(ids), now: () => now }), { sent: 0, dropped: 2 });
  assert.deepEqual(db.signals.map((s) => [s.id, s.dropped]), [['old', 'expired'], ['off', 'off']]);
  assert.deepEqual(db.nudges[0].contact_at, ago(27));
  assert.equal(sent.length, 0);
});

test('bấm lời nhắc: chỉ người nhận, ghi lúc mở một lần, trả người cần gọi', async () => {
  const db = fakeDb({ members: [kin('lan', 'Lan', 'me'), kin('an', 'An', 'con'), kin('binh', 'Bình', 'con'), kin('xuan', 'Xuân', 'con', { family_id: 'G' })],
    nudges: [nudge('n1', 'lan', 'an', ago(1))] });
  // App express gắn makeMayRouter(deps) sau một middleware đặt req.member từ header x-member, x-family (như members.test.ts).
  const app = express();
  app.use(langMiddleware);
  app.use((req: any, _res, next) => { req.member = { id: String(req.headers['x-member']), family_id: String(req.headers['x-family'] ?? 'F') }; next(); });
  app.use('/api', M.makeMayRouter({ db, notify: () => {}, now: () => now }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (path: string, who: string, family = 'F') => {
    const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'x-member': who, 'x-family': family, 'x-lang': 'vi' } });
    return { status: r.status, body: await r.json() };
  };
  try {
    const open = (who: string) => post('/api/may/nudges/n1/open', who);
    assert.deepEqual(await open('an'), { status: 200, body: { peerId: 'lan' } });
    const first = db.nudges.find((n) => n.id === 'n1')!.opened_at;
    assert.ok(first);
    await open('an');
    assert.equal(db.nudges.find((n) => n.id === 'n1')!.opened_at, first);
    assert.equal((await open('binh')).status, 404);
    // Thêm: mã lỗi ổn định; người kể đã rời nhà thì cũng không mở được.
    assert.equal((await open('binh')).body.code, 'nudge_not_found');
    // Người nhà khác cầm đúng mã lời nhắc thật: 404 như mã không có.
    assert.deepEqual(await post('/api/may/nudges/n1/open', 'xuan', 'G'), await post('/api/may/nudges/khong-co/open', 'xuan', 'G'));
    assert.equal((await post('/api/may/nudges/n1/open', 'xuan', 'G')).body.code, 'nudge_not_found');
    db.members = db.members.filter((m) => m.id !== 'lan');
    assert.equal((await open('an')).status, 404);
  } finally {
    server.close();
  }
});
