// Kiểm thử dữ liệu soạn câu lớn dần (server/callfacts.ts): dịp trong 30 ngày, bản đồ chủ đề, chọn sự thật trong sổ nhớ,
// và nạp cả bộ dữ liệu bằng DB giả (mỗi câu trong EXTRAS_SQL một nhánh, điều kiện viết lại bằng JS, như server/memory.test.ts).
// Không cần Postgres, không gọi mạng. Chạy: node --import tsx --test server/callfacts.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { FactPick, Seed, SeedInput } from './callfacts.ts';
import { themesFor } from '../src/shared.ts';

const F = await import('./callfacts.ts');

// i18n-ok-begin: dữ liệu kiểm thử
test('dịp trong 30 ngày: lễ dương, lễ âm qua năm, Ngày của Mẹ theo Chủ nhật, ngày của nhà; quá 30 ngày thì không', () => {
  const at = (s: string) => { const [year, month, day] = s.split('-').map(Number); return { year, month, day }; };
  const keys = (s: string, events: any[] = []) => F.upcomingOccasions({ today: at(s), lang: 'vi', events }).map((o) => [o.key, o.date, o.inDays]);
  assert.deepEqual(keys('2026-11-20').find((o) => o[0] === 'teachers-20-11'), ['teachers-20-11', '2026-11-20', 0]);
  assert.equal(keys('2026-11-20').some((o) => o[0] === 'noel'), false);                       // 35 ngày
  assert.deepEqual(keys('2026-12-01').find((o) => o[0] === 'noel'), ['noel', '2026-12-25', 24]);
  assert.deepEqual(keys('2027-01-10').find((o) => o[0] === 'tet'), ['tet', '2027-02-06', 27]);
  assert.deepEqual(keys('2027-04-20').find((o) => o[0] === 'mothers-day'), ['mothers-day', '2027-05-09', 19]);
  const fam = F.upcomingOccasions({ today: at('2026-11-20'), lang: 'vi', events: [{ title: 'Sinh nhật An', kind: 'birthday', date: '2026-12-05', inDays: 15, dobName: 'An' }] });
  assert.deepEqual(fam.find((o) => o.who === 'An')?.key, 'birthday');
  assert.equal(F.upcomingOccasions({ today: at('2026-11-20'), lang: 'vi', events: [] }).find((o) => o.key === 'teachers-20-11')?.name, 'Ngày Nhà giáo 20/11');
});
test('bản đồ chủ đề: đếm lần kể, kể sâu nhất, lần gần nhất; cuộc gọi cũ theo chủ đề cũ', () => {
  const v2 = (theme: string, doneAt: string, storyTurns: number) => ({ script: { v: 2, questions: [{ part: 'checkin' }, { part: 'story', theme }] } as any, doneAt, storyTurns });
  const old = (topic: string) => ({ script: { questions: [{ topic }] } as any, doneAt: '2026-11-01', storyTurns: 2 });
  const m = F.topicMap([v2('mon-an', '2026-11-08', 4), v2('mon-an', '2026-11-15', 1), old('ngay-cuoi'), old('cuoc-song')]);
  assert.deepEqual(m.find((t) => t.theme === 'mon-an'), { theme: 'mon-an', times: 2, turns: 4, last: '2026-11-15' });
  assert.ok(m.some((t) => t.theme === 'ngay-cuoi'));
  assert.equal(m.length, 2);
});
test('chọn sự thật: riêng của người khác không bao giờ vào; về chính người nghe trước; chưa dùng trước; dịp sắp tới; tối đa 30', () => {
  const f = (id: string, o: Partial<FactPick> = {}): FactPick => ({ id, about_id: null, source_id: 'lan', kind: 'food', text_en: id, visibility: 'family',
    details: {}, used_at: null, used_count: 0, created_at: new Date('2026-11-01'), ...o });
  const pick = (rows: FactPick[], occ: string[] = []) => F.pickFacts(rows, { listenerId: 'an', occasionKeys: occ, now: new Date('2026-11-20'), max: 30 }).map((x) => x.id);
  assert.deepEqual(pick([f('lan-self', { visibility: 'self' }), f('an-self', { visibility: 'self', source_id: 'an' })]), ['an-self']);
  assert.equal(pick([f('other'), f('about-an', { about_id: 'an' })])[0], 'about-an');
  assert.equal(pick([f('used', { used_count: 2, used_at: new Date('2026-11-19') }), f('fresh')])[0], 'fresh');
  assert.equal(pick([f('plain'), f('tet', { details: { occasion: 'tet' } })], ['tet'])[0], 'tet');
  assert.equal(pick(Array.from({ length: 40 }, (_, i) => f(`f${i}`))).length, 30);
});
test('bản đồ chủ đề đọc cả cuộc gọi v3', () => {
  const questions = [{ part: 'checkin' }, { topic: 'loi-nhan' }, { part: 'story', theme: 'mon-an' }];
  assert.deepEqual(F.topicMap([{ script: { v: 3, questions } as any, doneAt: '2026-11-21', storyTurns: 6 }])[0], { theme: 'mon-an', times: 1, turns: 6, last: '2026-11-21' });
});
test('bản đồ chủ đề v3 nhiều chuyện: mỗi ô đếm lượt riêng, chuyện một lượt không thành chuyện kể sâu', () => {
  const questions = [{ part: 'checkin' }, { topic: 'loi-nhan' }, { part: 'story', theme: 'que-nha' }, { part: 'story', theme: 'uoc-mo' }, { part: 'story', theme: 'que-nha' }];
  const m = F.topicMap([{ script: { v: 3, questions } as any, doneAt: '2026-11-21', storyTurns: 8, turnsByIdx: { 2: 5, 3: 1, 4: 2 } }]);
  assert.deepEqual(m.find((t) => t.theme === 'que-nha'), { theme: 'que-nha', times: 1, turns: 5, last: '2026-11-21' }); // hai ô cùng chủ đề: một lần, ô sâu nhất
  assert.deepEqual(m.find((t) => t.theme === 'uoc-mo'), { theme: 'uoc-mo', times: 1, turns: 1, last: '2026-11-21' });
  assert.equal(F.topicMap([{ script: { v: 3, questions } as any, doneAt: '2026-11-21', storyTurns: 8, turnsByIdx: {} }]).find((t) => t.theme === 'uoc-mo')?.turns, 0);
});

// ---------- Mây Live: mức độ sâu, mồi chuyện ----------

test('mức độ sâu: làm quen, gia đình, sâu', () => {
  assert.equal(F.depthOf({ done: 0, facts: 40 }), 0);
  assert.equal(F.depthOf({ done: 3, facts: 4 }), 0);
  assert.equal(F.depthOf({ done: 1, facts: 5 }), 1);
  assert.equal(F.depthOf({ done: 5, facts: 20 }), 1);
  assert.equal(F.depthOf({ done: 4, facts: 21 }), 2);
});

/** Đầu vào mồi chuyện: mặc định mức 0, vai mẹ, nhà đủ bố mẹ chưa có ngày cưới (mọi chủ đề), chưa biết gì. */
const seedIn = (o: Partial<SeedInput> = {}): SeedInput => ({ depth: 0, role: 'me', intro: {}, place: null, far: false, family: [], memory: [],
  occasions: [], told: [], themes: themesFor('me', true, false), hook: null, hasPair: true, ...o });
const kinds = (s: Seed[]) => s.map((x) => x.kind);
const mem = (fact: string, o: Partial<SeedInput['memory'][number]> = {}): SeedInput['memory'][number] =>
  ({ id: fact, about: 'An', toldBy: 'Lan', toldByYou: false, private: false, kind: 'food', fact, ...o });

test('mồi chuyện mức 0: từ khảo sát và nơi ở, không mặc định tuổi thơ; câu hẹn tuần trước luôn đứng đầu', () => {
  const p = seedIn({ intro: { food: 'canh chua', seen: 'months' }, place: 'Hải Phòng', far: true });
  const s = F.seedsFor(p);
  assert.deepEqual(kinds(s), ['food', 'seen', 'place', 'away', 'everyday']);
  assert.deepEqual(s[0], { kind: 'food', hint: 'The dish their child loves: canh chua. Who cooks it, a meal with it they remember.', theme: 'mon-an' });
  assert.deepEqual(s[1], { kind: 'seen', hint: 'The last time the family was all together (survey: months). Where, who was there, what they did.', theme: 'tet-cac-dip' });
  assert.deepEqual(s[2], { kind: 'place', hint: 'Daily life at home in Hải Phòng these days.', theme: 'que-nha' });
  assert.equal(s[3].theme, 'con-di-xa');
  assert.ok(s.every((x) => x.theme !== 'tuoi-tho'));
  const h = F.seedsFor({ ...p, hook: 'Mẹ kể tiếp chuyện bà ngoại' });
  assert.deepEqual(h[0], { kind: 'hook', hint: 'Last call ended with this promise: Mẹ kể tiếp chuyện bà ngoại', theme: null });
  assert.equal(h.length, 5);
  // Con: món nhớ nhất, cuộc sống nơi đang ở, nhớ nhà; ở cùng mà ít nói thì một ngày bình thường ở nhà.
  const con = F.seedsFor(seedIn({ role: 'con', themes: themesFor('con', true, false), intro: { food: 'phở', seen: 'together' }, place: 'Busan', far: true }));
  assert.deepEqual(con.map((x) => [x.kind, x.theme]), [['food', 'mon-an'], ['seen', null], ['place', 'cong-viec'], ['away', 'que-nha'], ['everyday', null]]);
  assert.equal(con[0].hint, 'The home dish they miss most: phở. Who made it, a meal they remember.');
  assert.equal(con[2].hint, 'Life in Busan: what a normal day there is like, what surprised them.');
});
test('mồi chuyện mức 1: dịp gần nhất, điều người khác kể kèm tên người kể, chuyện về từng người', () => {
  const p = seedIn({ depth: 1, intro: { food: 'canh chua' },
    family: [{ name: 'Hùng', role: 'bo' }, { name: 'An', role: 'con' }, { name: 'Bình', role: 'con' }, { name: 'Chi', role: 'con' }],
    occasions: [{ key: 'noel', name: 'Noel', date: '2026-12-25', inDays: 24, who: null }, { key: 'birthday', name: 'Sinh nhật An', date: '2026-12-30', inDays: 29, who: 'An' }],
    memory: [mem('Lan worries about money', { about: 'Lan', toldBy: 'Lan', toldByYou: true }), mem('An loves sour soup', { toldBy: 'An' })] });
  const s = F.seedsFor(p);
  assert.deepEqual(kinds(s), ['occasion', 'heard', 'person', 'person', 'together']);
  assert.deepEqual(s[0], { kind: 'occasion', hint: 'Noel is in 24 days: how they will keep it this year, how it was in earlier years.', theme: 'tet-cac-dip' });
  assert.deepEqual(s[1], { kind: 'heard', hint: 'An told Mây: An loves sour soup. Ask their side of it and say who told it.', theme: null });
  assert.deepEqual(s[2], { kind: 'person', hint: 'A story about An (their child): a moment with them they remember well.', theme: null });
  assert.match(s[3].hint, /^A story about Bình \(their child\)/);                                // tối đa hai người
  // Ngày của nhà thì không gắn chủ đề lễ Tết; con hỏi về bố mẹ thì chủ đề bố mẹ mình.
  assert.equal(F.seedsFor({ ...p, occasions: [p.occasions[1]] })[0].theme, null);
  const con = F.seedsFor(seedIn({ depth: 1, role: 'con', themes: themesFor('con', true, false), family: [{ name: 'Lan', role: 'me' }, { name: 'Hùng', role: 'bo' }, { name: 'Bình', role: 'con' }] }));
  assert.deepEqual(con.filter((x) => x.kind === 'person').map((x) => [x.hint, x.theme]), [
    ['A story about Lan (their mother): a moment with them they remember well.', 'bo-me-minh'],
    ['A story about Hùng (their father): a moment with them they remember well.', 'bo-me-minh']]);
});
test('mồi chuyện: điều riêng không bao giờ thành mồi; chủ đề không hợp vai thì bỏ; chủ đề đã kể sâu thì bỏ', () => {
  const secret = mem('An is afraid of losing the scholarship', { toldBy: 'An', toldByYou: true, private: true, kind: 'person' });
  const child = seedIn({ depth: 2, role: 'con', themes: themesFor('con', true, false), family: [{ name: 'Lan', role: 'me' }, { name: 'Hùng', role: 'bo' }],
    memory: [secret, mem('Grandma raised Mom in Nam Dinh', { about: 'Lan', kind: 'person' }), mem('Dad served in the army', { about: 'Hùng', toldBy: 'Hùng', kind: 'milestone' })] });
  const s = F.seedsFor(child);
  assert.deepEqual(kinds(s), ['thread', 'thread', 'relation', 'heard', 'person']);
  assert.deepEqual(s[0], { kind: 'thread', hint: 'Mentioned before but never told as a story: Grandma raised Mom in Nam Dinh (told by Lan).', theme: 'bo-me-minh' });
  assert.equal(s[1].theme, 'cong-viec');
  assert.ok(s.every((x) => !x.hint.includes('scholarship')));
  assert.ok(F.seedsFor({ ...child, depth: 1 }).every((x) => !x.hint.includes('scholarship')));
  assert.deepEqual(s[2], { kind: 'relation', hint: 'Their parents when they were young, what they know of how they met.', theme: 'bo-me-minh' });
  assert.ok(s.every((x) => x.theme !== 'ngay-cuoi'));
  // Bố mẹ: chuyện hai người gặp nhau là chủ đề ngày cưới, chỉ khi chủ đề đó còn được hỏi.
  const parent = seedIn({ depth: 2, role: 'me' });
  assert.deepEqual(F.seedsFor(parent).find((x) => x.kind === 'relation'), { kind: 'relation', hint: 'How they and their husband met, their early days together.', theme: 'ngay-cuoi' });
  assert.equal(F.seedsFor({ ...parent, role: 'bo' }).find((x) => x.kind === 'relation')?.hint, 'How they and their wife met, their early days together.');
  const wed = F.seedsFor({ ...parent, themes: themesFor('me', true, true) });
  assert.ok(wed.every((x) => x.theme !== 'ngay-cuoi' && x.kind !== 'relation'));
  assert.ok(F.seedsFor({ ...parent, hasPair: false }).every((x) => x.kind !== 'relation'));
  // Chủ đề đã kể sâu (từ 3 lượt) thì bỏ; kể ngắn thì vẫn giữ; sợi chuyện chỉ lấy chủ đề chưa kể sâu.
  const food = seedIn({ intro: { food: 'canh chua' } });
  assert.ok(!kinds(F.seedsFor({ ...food, told: [{ theme: 'mon-an', times: 1, turns: 4, last: '2026-11-15' }] })).includes('food'));
  assert.ok(kinds(F.seedsFor({ ...food, told: [{ theme: 'mon-an', times: 1, turns: 2, last: '2026-11-15' }] })).includes('food'));
  const deep = F.seedsFor({ ...child, told: [{ theme: 'bo-me-minh', times: 1, turns: 3, last: '2026-11-15' }] });
  assert.deepEqual(kinds(deep), ['thread', 'heard', 'together']);
  assert.equal(deep[0].theme, 'cong-viec');
});
test('mồi chuyện: không biết gì thì vẫn đủ ba mồi', () => {
  const s = F.seedsFor(seedIn());
  assert.deepEqual(kinds(s), ['everyday', 'together', 'childhood']);
  assert.deepEqual(s[2], { kind: 'childhood', hint: 'What they loved doing as a child.', theme: 'tuoi-tho' });
  assert.equal(s[0].hint, 'Something small from their week that made them smile.');
  assert.deepEqual(kinds(F.seedsFor(seedIn({ depth: 1 }))), ['together', 'everyday', 'childhood']);
});

// ---------- Nạp cả bộ dữ liệu (DB giả) ----------

type Row = Record<string, any>;
const member = (id: string, name: string, role: string, city: string, o: Row = {}): Row =>
  ({ id, family_id: 'F', name, role, city, loc_share: false, loc_lat: null, loc_lon: null, loc_at: null, dob: null, intro: null, ...o });
const fact = (id: string, o: Row): Row => ({ id, family_id: 'F', about_id: null, kind: 'food', text_en: id, visibility: 'family', details: {},
  used_at: null, used_count: 0, replacement_id: null, created_at: new Date('2026-11-10'), ...o });

/** DB giả: đúng từng câu trong EXTRAS_SQL, điều kiện viết lại bằng JS. */
function fakeDb(members: Row[], facts: Row[], calls: Row[], nudges: Row[] = []) {
  const S = F.EXTRAS_SQL;
  return {
    async query(q: string, v: any[] = []) {
      switch (q) {
        case S.member: return { rows: members.filter((m) => m.id === v[0]).map((m) => ({ ...m, has_wedding: false })) };
        case S.family: return { rows: members.filter((m) => m.family_id === v[0]) };
        case S.facts:
          return { rows: facts.filter((f) => f.family_id === v[0] && f.replacement_id == null && (f.visibility === 'family' || f.source_id === v[1]))
            .sort((a, b) => +b.created_at - +a.created_at).slice(0, 300) };
        case S.calls: return { rows: calls.filter((c) => c.member_id === v[0]) };
        case S.recent: {
          const at = new Map<string, number>();
          for (const n of nudges) {
            if ((n.from_id !== v[0] && n.to_id !== v[0]) || !(n.contact_at > v[1])) continue;
            const other = members.find((m) => m.id === (n.from_id === v[0] ? n.to_id : n.from_id) && m.family_id === n.family_id);
            if (other) at.set(other.name, Math.max(at.get(other.name) ?? 0, +n.contact_at));
          }
          return { rows: [...at].sort((a, b) => b[1] - a[1]).map(([name]) => ({ name })) };
        }
      }
      throw new Error(`DB giả chưa biết câu này: ${q}`);
    },
  };
}

test('nạp dữ liệu soạn câu: tuổi, nơi ở, giờ chênh, sổ nhớ có ai kể, dịp, chủ đề đã kể, chỗ trống hồ sơ; điều riêng của người khác và điều chưa nói không vào', async () => {
  assert.match(F.EXTRAS_SQL.facts, /replacement_id is null and \(visibility = 'family' or source_id = \$2\)/);
  const members = [
    member('lan', 'Lan', 'me', 'hanoi'), member('hung', 'Hùng', 'bo', 'hanoi'),
    member('an', 'An', 'con', 'busan', { dob: '2004-12-01', intro: JSON.stringify({ unsaid: 'bí mật không nói', kid: 'son', love: 'never' }) }),
  ];
  const facts = [
    fact('lan-self', { source_id: 'lan', about_id: 'lan', kind: 'health', visibility: 'self', text_en: 'Mom has back pain' }),
    fact('an-self', { source_id: 'an', about_id: 'an', kind: 'worry', visibility: 'self', text_en: 'An worries about exams' }),
    fact('food', { source_id: 'lan', about_id: 'an', kind: 'food', text_en: 'An loves sour soup' }),
    fact('old', { source_id: 'lan', about_id: 'an', replacement_id: 'food' }),
    fact('tet', { source_id: 'hung', kind: 'occasion', text_en: 'The family wraps banh chung at Tet', details: { occasion: 'tet' } }),
  ];
  const calls = [{ member_id: 'an', script: JSON.stringify({ v: 2, questions: [{ part: 'checkin' }, { part: 'story', theme: 'mon-an' }], next_hook: 'Bố kể tiếp chuyện đi bộ đội' }), done_at: '2026-11-15', story_turns: 3 }];
  // Lời nhắc của Mây đã dẫn tới liên lạc: với mẹ 1 hôm trước (tính), với bố 10 hôm trước (quá 7 ngày), lời nhắc chưa liên lạc thì không.
  const nudges = [
    { family_id: 'F', from_id: 'lan', to_id: 'an', contact_at: new Date('2026-11-19T11:00:00Z') },
    { family_id: 'F', from_id: 'an', to_id: 'hung', contact_at: new Date('2026-11-10T11:00:00Z') },
    { family_id: 'F', from_id: 'hung', to_id: 'an', contact_at: null },
  ];
  const urls: string[] = [];
  const fetchFn = (async (u: string) => { urls.push(String(u)); return new Response(JSON.stringify({ current: { temperature_2m: 4.6, weather_code: 3 } })); }) as typeof fetch;
  const x = await F.loadScriptExtras({ id: 'an', family_id: 'F' }, 'vi', {
    db: fakeDb(members, facts, calls, nudges), fetch: fetchFn, now: () => new Date('2026-11-20T11:00:00Z'), // 20:00 ở Busan
    events: async () => [{ title: 'Sinh nhật An', kind: 'birthday', date: '2026-12-01', inDays: 11, dobName: 'An' }],
  });
  assert.equal(x.age, 21);
  assert.deepEqual(x.place, { name: 'Busan', country: 'Hàn Quốc', tz: 'Asia/Seoul', localTime: '20:00', weather: '5°C, cloudy', feel: 'very cold' });
  assert.match(urls[0], /latitude=35\.2&longitude=129\.1&/);                                 // toạ độ làm tròn 1 số lẻ
  assert.equal(urls.length, 1);                                                              // thời tiết cũ và cảm giác: một lần hỏi mạng
  assert.deepEqual(x.family.map((m) => [m.name, m.place, m.hoursApart]), [['Lan', 'Hà Nội, Việt Nam', -2], ['Hùng', 'Hà Nội, Việt Nam', -2]]);
  assert.ok(x.family[0].km! > 2500 && x.family[0].km! < 3000);
  assert.deepEqual(x.memory.map((m) => [m.id, m.about, m.toldBy, m.toldByYou, m.private]).sort(), [
    ['an-self', 'An', 'An', true, true], ['food', 'An', 'Lan', false, false], ['tet', 'whole family', 'Hùng', false, false]]);
  assert.deepEqual(x.occasions.map((o) => [o.key, o.inDays, o.who]), [['teachers-20-11', 0, null], ['birthday', 11, 'An']]);
  assert.deepEqual(x.told, [{ theme: 'mon-an', times: 1, turns: 3, last: '2026-11-15' }]);
  assert.ok(x.themes.includes('mon-an') && !x.themes.includes('ngay-cuoi'));
  assert.deepEqual(x.gaps, ['seen']);                                                        // đã có sự thật món ăn về An
  assert.deepEqual(x.recent, ['Lan']);
  // Mây Live: câu hẹn của cuộc gọi mới nhất đứng đầu mồi; chưa nói thương bao giờ thì giọng ấm; 3 sự thật thì vẫn mức làm quen; ở xa thì có mồi nhớ nhà.
  assert.equal(x.hook, 'Bố kể tiếp chuyện đi bộ đội');
  assert.equal(x.warm, true);
  assert.equal(x.depth, 0);
  assert.deepEqual(x.seeds.map((s) => s.kind), ['hook', 'place', 'away', 'everyday']);
  assert.match(x.seeds[0].hint, /Bố kể tiếp chuyện đi bộ đội/);
  assert.doesNotMatch(JSON.stringify(x), /bí mật|back pain/);
});
test('nạp dữ liệu Mây Live: cuộc gọi v3 đếm lượt theo từng ô chuyện; câu hẹn chỉ lấy ở cuộc gọi mới nhất; đủ sự thật thì lên mức gia đình', async () => {
  assert.match(F.EXTRAS_SQL.calls, /group by a\.idx/);
  const members = [member('lan', 'Lan', 'me', 'hanoi', { intro: JSON.stringify({ love: 'often', food: '  canh chua  ' }) }), member('an', 'An', 'con', 'hanoi')];
  const facts = Array.from({ length: 6 }, (_, i) => fact(`f${i}`, { source_id: 'an', about_id: 'an', text_en: `fact ${i}` }));
  const v3 = (themes: string[], hook: string) => JSON.stringify({ v: 3, questions: [{ part: 'checkin' }, { topic: 'loi-nhan' }, ...themes.map((theme) => ({ part: 'story', theme }))], next_hook: hook });
  const calls = [
    { member_id: 'lan', script: v3(['que-nha', 'uoc-mo'], '  '), done_at: '2026-11-19', story_turns: 6, idx_turns: { 2: 5, 3: 1 } },
    { member_id: 'lan', script: v3(['mon-an'], 'Mẹ kể tiếp chuyện bà ngoại'), done_at: '2026-11-12', story_turns: 0, idx_turns: null },
  ];
  const x = await F.loadScriptExtras({ id: 'lan', family_id: 'F' }, 'vi', {
    db: fakeDb(members, facts, calls), fetch: (async () => new Response(JSON.stringify({ current: { temperature_2m: 26, weather_code: 0 } }))) as typeof fetch,
    now: () => new Date('2026-11-20T11:00:00Z'), events: async () => [],
  });
  assert.deepEqual(x.told.map((t) => [t.theme, t.turns]), [['que-nha', 5], ['uoc-mo', 1], ['mon-an', 0]]);
  assert.equal(x.hook, null);
  assert.equal(x.warm, false);
  assert.equal(x.depth, 1);
  assert.equal(x.place.feel, null);                                                          // trời dễ chịu thì không nói
  assert.equal(x.place.weather, '26°C, clear');
  assert.ok(x.seeds.some((s) => s.hint.includes('canh chua.')));                             // món của khảo sát, bỏ khoảng trắng thừa
  assert.ok(x.seeds.length >= 3 && x.seeds.length <= 5);
});
// i18n-ok-end
