// Kiểm thử dữ liệu soạn câu lớn dần (server/callfacts.ts): dịp trong 30 ngày, bản đồ chủ đề, chọn sự thật trong sổ nhớ,
// và nạp cả bộ dữ liệu bằng DB giả (mỗi câu trong EXTRAS_SQL một nhánh, điều kiện viết lại bằng JS, như server/memory.test.ts).
// Không cần Postgres, không gọi mạng. Chạy: node --import tsx --test server/callfacts.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { FactPick } from './callfacts.ts';

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

// ---------- Nạp cả bộ dữ liệu (DB giả) ----------

type Row = Record<string, any>;
const member = (id: string, name: string, role: string, city: string, o: Row = {}): Row =>
  ({ id, family_id: 'F', name, role, city, loc_share: false, loc_lat: null, loc_lon: null, loc_at: null, dob: null, intro: null, ...o });
const fact = (id: string, o: Row): Row => ({ id, family_id: 'F', about_id: null, kind: 'food', text_en: id, visibility: 'family', details: {},
  used_at: null, used_count: 0, replacement_id: null, created_at: new Date('2026-11-10'), ...o });

/** DB giả: đúng từng câu trong EXTRAS_SQL, điều kiện viết lại bằng JS. */
function fakeDb(members: Row[], facts: Row[], calls: Row[]) {
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
      }
      throw new Error(`DB giả chưa biết câu này: ${q}`);
    },
  };
}

test('nạp dữ liệu soạn câu: tuổi, nơi ở, giờ chênh, sổ nhớ có ai kể, dịp, chủ đề đã kể, chỗ trống hồ sơ; điều riêng của người khác và điều chưa nói không vào', async () => {
  assert.match(F.EXTRAS_SQL.facts, /replacement_id is null and \(visibility = 'family' or source_id = \$2\)/);
  const members = [
    member('lan', 'Lan', 'me', 'hanoi'), member('hung', 'Hùng', 'bo', 'hanoi'),
    member('an', 'An', 'con', 'busan', { dob: '2004-12-01', intro: JSON.stringify({ unsaid: 'bí mật không nói', kid: 'son' }) }),
  ];
  const facts = [
    fact('lan-self', { source_id: 'lan', about_id: 'lan', kind: 'health', visibility: 'self', text_en: 'Mom has back pain' }),
    fact('an-self', { source_id: 'an', about_id: 'an', kind: 'worry', visibility: 'self', text_en: 'An worries about exams' }),
    fact('food', { source_id: 'lan', about_id: 'an', kind: 'food', text_en: 'An loves sour soup' }),
    fact('old', { source_id: 'lan', about_id: 'an', replacement_id: 'food' }),
    fact('tet', { source_id: 'hung', kind: 'occasion', text_en: 'The family wraps banh chung at Tet', details: { occasion: 'tet' } }),
  ];
  const calls = [{ member_id: 'an', script: JSON.stringify({ v: 2, questions: [{ part: 'checkin' }, { part: 'story', theme: 'mon-an' }] }), done_at: '2026-11-15', story_turns: 3 }];
  const urls: string[] = [];
  const fetchFn = (async (u: string) => { urls.push(String(u)); return new Response(JSON.stringify({ current: { temperature_2m: 4.6, weather_code: 3 } })); }) as typeof fetch;
  const x = await F.loadScriptExtras({ id: 'an', family_id: 'F' }, 'vi', {
    db: fakeDb(members, facts, calls), fetch: fetchFn, now: () => new Date('2026-11-20T11:00:00Z'), // 20:00 ở Busan
    events: async () => [{ title: 'Sinh nhật An', kind: 'birthday', date: '2026-12-01', inDays: 11, dobName: 'An' }],
  });
  assert.equal(x.age, 21);
  assert.deepEqual(x.place, { name: 'Busan', country: 'Hàn Quốc', tz: 'Asia/Seoul', localTime: '20:00', weather: '5°C, cloudy' });
  assert.match(urls[0], /latitude=35\.2&longitude=129\.1&/);                                 // toạ độ làm tròn 1 số lẻ
  assert.deepEqual(x.family.map((m) => [m.name, m.place, m.hoursApart]), [['Lan', 'Hà Nội, Việt Nam', -2], ['Hùng', 'Hà Nội, Việt Nam', -2]]);
  assert.ok(x.family[0].km! > 2500 && x.family[0].km! < 3000);
  assert.deepEqual(x.memory.map((m) => [m.id, m.about, m.toldBy, m.toldByYou, m.private]).sort(), [
    ['an-self', 'An', 'An', true, true], ['food', 'An', 'Lan', false, false], ['tet', 'whole family', 'Hùng', false, false]]);
  assert.deepEqual(x.occasions.map((o) => [o.key, o.inDays, o.who]), [['teachers-20-11', 0, null], ['birthday', 11, 'An']]);
  assert.deepEqual(x.told, [{ theme: 'mon-an', times: 1, turns: 3, last: '2026-11-15' }]);
  assert.ok(x.themes.includes('mon-an') && !x.themes.includes('ngay-cuoi'));
  assert.deepEqual(x.gaps, ['seen']);                                                        // đã có sự thật món ăn về An
  assert.doesNotMatch(JSON.stringify(x), /bí mật|back pain/);
});
// i18n-ok-end
