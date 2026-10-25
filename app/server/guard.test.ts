// Kiểm lớp lọc chống bịa suspect() và đọc ngày parseDate() cho vi, en, ko. Không gọi mạng. Chạy cùng npm run test:tts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, suspect, type Allow } from './guard.ts';

const NONE: Allow = { prevCall: false, ownStory: false, photos: false };
const ALL: Allow = { prevCall: true, ownStory: true, photos: true };
const HAY = JSON.stringify({ person: { name: 'Lan', role: 'con' }, family_members: [{ name: 'Lan', role: 'con' }, { name: 'Hùng', role: 'bo' }, { name: '민지', role: 'me' }], calendar: [{ kind: 'birthday', day: 12, month: 3 }] }) + ' March';

// i18n-ok-begin
test('suspect: câu hợp lệ không bị chặn (vi, en, ko)', () => {
  const ok: Array<[string, Allow, 'vi' | 'en' | 'ko']> = [
    ['Lan ơi, tuần này bên đó thế nào?', NONE, 'vi'],
    ['Dạ, con chào bố. Bố có khoẻ không ạ?', NONE, 'vi'],
    ['Hi Lan, it\'s Mây. How was your week?', NONE, 'en'],
    ["What's been on your mind lately?", NONE, 'en'],
    ['What did you eat today, Mom?', NONE, 'en'],
    ['Do you remember when you first learned to cook?', NONE, 'en'],
    ['Is there a photo you would like to tell me about?', NONE, 'en'],
    ['I love hearing about your Sunday mornings.', NONE, 'en'],
    ['How do you celebrate Christmas or Lunar New Year?', NONE, 'en'],
    ['Your birthday is in March, how do you like to spend it?', NONE, 'en'],
    ['Lan님, 안녕하세요. 저는 Mây예요.', NONE, 'ko'],
    ['어머님, 오늘 하루는 어떠셨어요?', NONE, 'ko'],
    ['요즘 날씨는 어때요?', NONE, 'ko'],
    ['결혼하기 전에 어떤 꿈이 있으셨어요?', NONE, 'ko'],
    ['이야기해 주고 싶은 사진이 있으세요?', NONE, 'ko'],
    ['민지님, 이번 주에 가족에게 전하고 싶은 말 있어요?', NONE, 'ko'],
    ['시간이 아까워요, 짧게 여쭤볼게요.', NONE, 'ko'],
    ['지난번에 들려주신 이야기 정말 좋았어요.', ALL, 'ko'],
    ['Last time you told me about your garden. How is it now?', ALL, 'en'],
  ];
  for (const [s, allow, lang] of ok) assert.equal(suspect(s, HAY, allow, lang), null, s);
  // Dữ liệu có đáp án "Daughter" thì được nói; "strawberry" (딸기) không tính.
  assert.equal(suspect('What would you tell your daughter Lan?', HAY + ' "kid":"Daughter"', NONE, 'en'), null);
  assert.equal(suspect('딸기 좋아하세요?', HAY, NONE, 'ko'), null);
});

test('suspect: dấu hiệu bịa bị chặn (vi, en, ko)', () => {
  const bad: Array<[string, 'vi' | 'en' | 'ko']> = [
    ['Hôm qua bạn ăn gì?', 'vi'],
    ['Lần trước bạn kể về quê, kể tiếp nhé?', 'vi'],
    ['Tấm ảnh bạn đã gửi đẹp quá.', 'vi'],
    ['Minh ơi, dạo này thế nào?', 'vi'],
    ['Last time we talked about your school.', 'en'],
    ['What did you have for dinner yesterday?', 'en'],
    ['You told me you love cooking.', 'en'],
    ['You mentioned your garden, how is it?', 'en'],
    ['Remember when we went to the beach?', 'en'],
    ['The photo you sent was lovely.', 'en'],
    ['As you sent earlier, tell me more.', 'en'],
    ['How is Grandma doing these days?', 'en'],
    ['Minh, how was your week?', 'en'],
    ['How is life in Korea?', 'en'],
    ['You turned 25 this year, right?', 'en'],
    ['지난번에 하신 이야기 이어서 해 주세요.', 'ko'],
    ['어제는 뭐 드셨어요?', 'ko'],
    ['보내주신 사진 정말 예뻤어요.', 'ko'],
    ['말씀하신 김치찌개는 어떻게 만드세요?', 'ko'],
    ['아까 이야기한 거 더 들려주세요.', 'ko'],
    ['민수님은 요즘 어떻게 지내세요?', 'ko'],
    ['수진 씨는 잘 지내요?', 'ko'],
    ['Minh님, 안녕하세요.', 'ko'],
    ['따님 Lan님에게 전하고 싶은 말 있으세요?', 'ko'],
    ['가장 좋아하시는 한국 음식은 무엇이세요?', 'ko'],
    ['What would you tell your daughter Lan?', 'en'],
    ['Con gái của mẹ dạo này thế nào?', 'vi'],
  ];
  for (const [s, lang] of bad) assert.ok(suspect(s, HAY, NONE, lang), s);
});

test('parseDate: vi, en, ko', () => {
  assert.deepEqual(parseDate('cưới vào ngày 12 tháng 3 năm 1995', 'vi'), { day: 12, month: 3, year: 1995 });
  assert.deepEqual(parseDate('hôm đó là 12/3/1995', 'vi'), { day: 12, month: 3, year: 1995 });
  assert.deepEqual(parseDate('We got married on March 12, 1995.', 'en'), { day: 12, month: 3, year: 1995 });
  assert.deepEqual(parseDate('It was 12 March 1995', 'en'), { day: 12, month: 3, year: 1995 });
  assert.deepEqual(parseDate('on the 12th of March', 'en'), { day: 12, month: 3, year: null });
  assert.deepEqual(parseDate('Sept 3rd 2001', 'en'), { day: 3, month: 9, year: 2001 });
  assert.deepEqual(parseDate('3/25/1990', 'en'), { day: 25, month: 3, year: 1990 });
  assert.equal(parseDate('3/4/1990', 'en'), null);
  assert.deepEqual(parseDate('1995년 3월 12일에 결혼했어요', 'ko'), { day: 12, month: 3, year: 1995 });
  assert.deepEqual(parseDate('3월 12일이 생일이에요', 'ko'), { day: 12, month: 3, year: null });
  assert.equal(parseDate('I like March a lot', 'en'), null);
  assert.equal(parseDate('ngày 40 tháng 3', 'vi'), null);
});
// i18n-ok-end
