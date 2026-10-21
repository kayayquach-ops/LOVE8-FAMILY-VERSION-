import { morningAt } from '@/lib/format';
import type { AppState, Chapter } from './types';

// Dữ liệu mẫu cho bản demo: gia đình chị Lan, du học sinh thạc sĩ ở Seoul,
// bố mẹ và bà ngoại ở Nam Định, em trai Nam học đại học ở Hà Nội.

export const CHAPTERS: Chapter[] = [
  { id: 'tuoi-tho', title: 'Tuổi thơ', emoji: '🪁', description: 'Ngôi nhà, trò chơi, những ngày Tết đầu tiên' },
  { id: 'tuoi-tre', title: 'Tuổi trẻ', emoji: '🚲', description: 'Ước mơ, bạn bè, những chuyến đi' },
  { id: 'tinh-yeu', title: 'Tình yêu', emoji: '💌', description: 'Bố mẹ gặp nhau và về chung một nhà' },
  { id: 'lap-nghiep', title: 'Lập nghiệp', emoji: '🧵', description: 'Công việc, khó khăn, thành quả' },
  { id: 'lam-cha-me', title: 'Làm cha mẹ', emoji: '👶', description: 'Ngày con chào đời và lớn lên' },
  { id: 'que-huong', title: 'Quê hương', emoji: '🌾', description: 'Ông bà, tổ tiên, phong tục quê nhà' },
  { id: 'mon-an', title: 'Món ăn của mẹ', emoji: '🍲', description: 'Công thức và kỷ niệm bên mâm cơm' },
  { id: 'loi-dan', title: 'Lời dặn', emoji: '🕯️', description: 'Điều bố mẹ muốn con cháu mang theo' },
];

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

export function createSeedState(): AppState {
  // Lời chào buổi sáng: sáng nay đã đến giờ (theo giờ người nhận), và một tin hẹn cho sáng mai.
  const thisMorningKR = morningAt('KR', 'last').toISOString();
  const thisMorningVN = morningAt('VN', 'last').toISOString();
  const tomorrowVN = morningAt('VN', 'next').toISOString();

  return {
    onboarded: false,
    meId: 'lan',
    family: {
      id: 'fam-1',
      name: 'Nhà mình',
      inviteCode: 'NHA-2611',
      members: [
        {
          id: 'lan', name: 'Nguyễn Thu Lan', role: 'con', roleLabel: 'Lan', city: 'Seoul', country: 'KR',
          birthday: { calendar: 'solar', day: 14, month: 7, year: 2002 }, awaySince: '2025-02-24', lastActiveAt: hoursAgo(0.2),
        },
        {
          id: 'me', name: 'Trần Thị Hoa', role: 'me', roleLabel: 'Mẹ', city: 'Nam Định', country: 'VN',
          birthday: { calendar: 'lunar', day: 12, month: 3, year: 1974 }, lastActiveAt: hoursAgo(0.1),
        },
        {
          id: 'bo', name: 'Nguyễn Văn Minh', role: 'bo', roleLabel: 'Bố', city: 'Nam Định', country: 'VN',
          birthday: { calendar: 'solar', day: 5, month: 9, year: 1971 }, lastActiveAt: hoursAgo(5),
        },
        {
          id: 'nam', name: 'Nguyễn Hoàng Nam', role: 'con', roleLabel: 'Nam', city: 'Hà Nội', country: 'VN',
          birthday: { calendar: 'solar', day: 2, month: 12, year: 2005 }, awaySince: '2023-09-01', lastActiveAt: hoursAgo(0.4),
        },
        {
          id: 'ba', name: 'Phạm Thị Thảo', role: 'ba', roleLabel: 'Bà ngoại', city: 'Nam Định', country: 'VN',
          birthday: { calendar: 'lunar', day: 8, month: 8, year: 1948 }, lastActiveAt: daysAgo(1),
        },
      ],
    },
    posts: [
      {
        id: 'p1', authorId: 'me', createdAt: hoursAgo(1.2), caption: 'Mâm cơm tối nay: canh cua rau đay, cà pháo. Con ăn cơm chưa?',
        tag: 'an-com', reactions: { bo: '❤️' }, replies: [{ id: 'r1', authorId: 'bo', text: 'Canh mẹ nấu ngon lắm', createdAt: hoursAgo(1) }],
      },
      {
        id: 'p9', authorId: 'nam', createdAt: hoursAgo(0.8), caption: 'Cơm bụi cạnh ký túc xá, 35 nghìn có cả trứng', tag: 'an-com',
        reactions: { me: '🥺' }, replies: [],
      },
      {
        id: 'p2', authorId: 'lan', createdAt: hoursAgo(2.5), caption: 'Con ở thư viện, mai nộp báo cáo rồi', tag: 'di-hoc',
        reactions: { me: '🥺', bo: '💪' }, replies: [{ id: 'r2', authorId: 'me', voiceSec: 14, createdAt: hoursAgo(2.2) }],
      },
      {
        id: 'p3', authorId: 'bo', createdAt: hoursAgo(5), caption: 'Mấy chậu lan con trồng trước khi đi đã ra hoa', tag: 'khoe',
        reactions: { lan: '😍', me: '❤️' }, replies: [],
      },
      {
        id: 'p6', authorId: 'ba', createdAt: daysAgo(1.1), caption: 'Vườn bà hái được rổ ổi đầu mùa, để dành Tết các cháu về', tag: 'khoe',
        reactions: { lan: '❤️' }, replies: [],
      },
      {
        id: 'p4', authorId: 'nam', createdAt: daysAgo(2), caption: 'Thi xong môn khó nhất kỳ này!', tag: 'di-hoc',
        reactions: { me: '👏' }, replies: [],
      },
      {
        id: 'p8', authorId: 'me', createdAt: daysAgo(3), caption: 'Ảnh cưới của bố mẹ, mẹ tìm thấy trong tủ', tag: 'xua', year: 1999,
        reactions: { lan: '😍', nam: '😂' }, replies: [],
      },
      {
        id: 'p7', authorId: 'nam', createdAt: daysAgo(3.2), caption: 'Thức khuya vẽ xong poster cho cuộc thi của trường', tag: 'di-hoc',
        reactions: {}, replies: [],
      },
      {
        id: 'p5', authorId: 'ba', createdAt: daysAgo(4), caption: 'Bà đi lễ chùa, cầu cho các cháu mạnh khoẻ', tag: 'binh-an',
        reactions: { lan: '❤️', nam: '❤️' }, replies: [],
      },
    ],
    stories: [
      {
        id: 's1', tellerId: 'me', title: 'Ngày đầu đi làm ở nhà máy dệt', chapterId: 'tuoi-tre', year: 1992,
        createdAt: daysAgo(3), durationSec: 372, emoji: '🧵', photoEmojis: ['🏭', '🚲', '🧵'],
        question: 'Hồi trẻ, ngày đầu tiên đi làm của mẹ thế nào?', askedById: 'lan',
        transcript:
          'Năm đó mẹ mười tám tuổi, vừa đỗ sư phạm văn thì bà ngoại ốm, nhà cần tiền nên mẹ đi làm. Mẹ đạp xe mười hai cây số lên nhà máy dệt, đến nơi trời còn chưa sáng. Mẹ ngồi chờ ở cổng mà tim đập thình thịch. Cô Hoa tổ trưởng dẫn mẹ vào xưởng, tiếng máy dệt to đến mức hai người phải hét vào tai nhau. Tháng lương đầu tiên mẹ mua cho bà ngoại một cái khăn len màu đỏ.',
        quote: 'Mẹ ngồi chờ ở cổng mà tim đập thình thịch.',
        people: ['Bà ngoại', 'Cô Hoa (tổ trưởng)'], places: ['Nhà máy dệt Nam Định'], emotion: 'hồi hộp',
        privacy: 'family', reactions: { lan: '❤️', bo: '😄' },
        followUps: ['Mẹ với cô Hoa còn liên lạc không?', 'Cái khăn len đỏ giờ còn không ạ?'],
        perspectives: [{ authorId: 'ba', text: 'Bà vẫn giữ cái khăn đó trong tủ.', createdAt: daysAgo(2) }],
      },
      {
        id: 's2', tellerId: 'bo', title: 'Bố mẹ quen nhau ở hội làng', chapterId: 'tinh-yeu', year: 1996,
        createdAt: daysAgo(10), durationSec: 418, emoji: '💌', photoEmojis: ['🎑', '🎶', '💐'],
        question: 'Bố tỏ tình với mẹ thế nào?', askedById: 'lan',
        transcript:
          'Hội làng năm ấy có hát chèo. Bố đứng sau mẹ cả buổi mà không dám nói câu nào. Đến lúc tan hội, bố mượn cớ đèo mẹ về vì trời tối. Bố đạp chậm nhất có thể. Ba tháng sau bố mới dám viết thư, gấp làm tư, nhờ cậu con đưa hộ.',
        quote: 'Bố đạp chậm nhất có thể.',
        people: ['Mẹ', 'Cậu Tuấn'], places: ['Đình làng'], emotion: 'ngượng ngùng',
        privacy: 'family', reactions: { lan: '😍', nam: '😂', me: '🙈' },
        followUps: ['Lá thư đầu tiên bố viết gì?'],
        perspectives: [{ authorId: 'me', text: 'Bố đạp chậm thật, mẹ còn tưởng xe hỏng.', createdAt: daysAgo(9) }],
      },
      {
        id: 's3', tellerId: 'me', title: 'Đêm con chào đời', chapterId: 'lam-cha-me', year: 2002,
        createdAt: daysAgo(18), durationSec: 295, emoji: '👶', photoEmojis: ['🏥', '🌙', '👶'],
        transcript:
          'Con sinh vào đêm mười bốn tháng bảy, trời mưa rất to. Bố con chạy đi mượn xe khắp xóm. Lúc nghe tiếng con khóc, bà ngoại khóc theo. Bố mẹ đặt tên con là Lan vì ông ngoại thích hoa lan nhất.',
        quote: 'Lúc nghe tiếng con khóc, bà ngoại khóc theo.',
        people: ['Bố', 'Bà ngoại', 'Ông ngoại'], places: ['Bệnh viện tỉnh'], emotion: 'xúc động',
        privacy: 'family', reactions: { lan: '🥺', bo: '❤️' }, followUps: ['Ông ngoại trồng hoa lan ở đâu ạ?'],
        perspectives: [],
      },
      {
        id: 's4', tellerId: 'ba', title: 'Gánh hàng ở chợ Rồng', chapterId: 'lap-nghiep', year: 1975,
        createdAt: daysAgo(25), durationSec: 512, emoji: '🧺', photoEmojis: ['🧺', '🌅', '🍌'],
        transcript:
          'Ngày ấy bà gánh chuối lên chợ Rồng từ ba giờ sáng. Một gánh nặng gần năm chục cân. Bà bán đến trưa thì đổi gạo mang về cho các cụ. Bà nhớ nhất là những hôm bán hết sớm, được ngồi uống bát nước chè xanh ở đầu chợ.',
        quote: 'Bát nước chè xanh ở đầu chợ là phần thưởng của bà.',
        people: ['Các cụ'], places: ['Chợ Rồng, Nam Định'], emotion: 'tự hào',
        privacy: 'family', reactions: { me: '❤️' }, followUps: ['Bà bán ở chợ bao nhiêu năm ạ?'], perspectives: [],
      },
      {
        id: 's5', tellerId: 'me', title: 'Nồi thịt kho ngày Tết của bà', chapterId: 'mon-an', year: 1985,
        createdAt: daysAgo(30), durationSec: 241, emoji: '🍖', photoEmojis: ['🍖', '🥚', '🧧'],
        transcript:
          'Bà ngoại kho thịt bằng nồi đất, đun bằng rơm suốt một đêm. Nước màu bà tự thắng, không bao giờ cho nước dừa vì ngoài mình không có dừa. Mẹ học được bí quyết là kho lửa thật nhỏ và không được mở vung.',
        quote: 'Kho lửa thật nhỏ và không được mở vung.',
        people: ['Bà ngoại'], places: ['Bếp nhà ngoại'], emotion: 'ấm áp',
        privacy: 'family', reactions: { lan: '🤤' }, followUps: [], perspectives: [],
      },
      {
        id: 's6', tellerId: 'bo', title: 'Điều bố muốn dặn con khi ở xa', chapterId: 'loi-dan',
        createdAt: daysAgo(40), durationSec: 186, emoji: '🕯️', photoEmojis: ['✈️', '🏠', '❤️'],
        transcript:
          'Con ở xa thì ăn uống cho đủ, đừng tiết kiệm vào cái ăn. Học được bao nhiêu thì học, nhưng đừng để mình cô đơn. Có chuyện gì cứ gọi về, bố mẹ không giận con bao giờ.',
        quote: 'Có chuyện gì cứ gọi về, bố mẹ không giận con bao giờ.',
        people: [], places: [], emotion: 'thương con',
        privacy: 'selected', sharedWith: ['lan'], reactions: { lan: '😭' }, followUps: [], perspectives: [],
      },
    ],
    chapters: CHAPTERS,
    questions: [
      { id: 'q1', fromId: 'lan', toId: 'me', kind: 'hidden', text: 'Mẹ có tiếc điều gì không?', gentle: 'Hồi 18 tuổi, cô mơ sau này làm nghề gì ạ?', status: 'answered', letterId: 'L1', storyId: 's1', createdAt: daysAgo(6) },
      { id: 'q2', fromId: 'lan', toId: 'bo', kind: 'hidden', text: 'Bố tỏ tình với mẹ thế nào?', gentle: 'Hồi trẻ chú với cô quen nhau ở đâu ạ?', status: 'answered', letterId: 'L2', storyId: 's2', createdAt: daysAgo(12) },
      { id: 'q3', fromId: 'nam', toId: 'bo', kind: 'hidden', text: 'Bố có từng muốn làm nghề khác không?', gentle: 'Hồi trẻ chú có nghề nào muốn thử mà chưa làm không ạ?', status: 'pending', createdAt: daysAgo(1) },
      { id: 'q4', fromId: 'lan', toId: 'ba', kind: 'hidden', text: 'Tết ngày xưa nhà mình làm những món gì?', gentle: 'Tết hồi bà còn nhỏ, nhà mình nấu những món gì hả bà?', status: 'asked', createdAt: daysAgo(2) },
      { id: 'q5', fromId: 'me', toId: 'lan', kind: 'hidden', text: 'Con ở bên đó có thật sự ổn không?', gentle: 'Tuần này lúc nào Lan thấy mệt nhất?', status: 'answered', letterId: 'L4', createdAt: daysAgo(8) },
      { id: 'q6', fromId: 'bo', toId: 'nam', kind: 'hidden', text: 'Dạo này Nam có chuyện gì mà ít gọi về?', gentle: 'Dạo này buổi tối Nam hay làm gì?', status: 'answered', letterId: 'L5', createdAt: daysAgo(4) },
      { id: 'q7', fromId: 'lan', toId: 'me', kind: 'hidden', text: 'Mẹ có buồn khi con đi du học không?', gentle: 'Những tối đầu tiên Lan sang Hàn, ở nhà cô thường làm gì ạ?', status: 'pending', createdAt: daysAgo(1) },
      { id: 'q8', fromId: 'me', toId: 'lan', kind: 'hidden', text: 'Con có người yêu chưa?', gentle: 'Ở Seoul, Lan hay đi chơi với ai nhất?', status: 'pending', createdAt: daysAgo(2) },
      { id: 'q9', fromId: 'bo', toId: 'lan', kind: 'hidden', text: 'Con có thiếu tiền không, sao không nói?', gentle: 'Ở bên đó, khoản nào làm Lan phải tính toán nhiều nhất?', status: 'pending', createdAt: daysAgo(3) },
      { id: 'q10', fromId: 'lan', toId: 'bo', kind: 'hidden', text: 'Bố có hay mệt không?', gentle: 'Dạo này một ngày của chú bắt đầu lúc mấy giờ ạ?', status: 'pending', createdAt: daysAgo(2) },
      { id: 'q11', fromId: 'lan', toId: 'me', kind: 'message', text: 'Tuần sau mẹ đi khám nhớ mang sổ nhé. Con thương mẹ.', status: 'pending', createdAt: hoursAgo(20) },
      { id: 'q12', fromId: 'me', toId: 'lan', kind: 'message', text: 'Mẹ gửi ít ruốc theo cô Hằng sang, cuối tháng con ra lấy nhé.', status: 'pending', createdAt: daysAgo(1) },
      { id: 'q13', fromId: 'bo', toId: 'lan', kind: 'message', text: 'Ăn uống cho đủ, đừng tiết kiệm vào cái ăn.', status: 'pending', createdAt: daysAgo(2) },
    ],
    letters: [
      {
        id: 'L1', speakerId: 'me', forIds: ['lan', 'nam'], createdAt: daysAgo(3), callSec: 552, highlightSec: 48,
        title: 'Mẹ từng mơ làm cô giáo', quote: 'Mẹ vẫn thuộc bài thơ đầu tiên mẹ định dạy học trò.',
        summary:
          'Năm 18 tuổi mẹ đỗ sư phạm văn nhưng không đi học, vì bà ngoại ốm và nhà cần tiền, nên mẹ vào nhà máy dệt. Mẹ nói không tiếc, vì nhờ thế mới gặp bố. Đến giờ tối nào mẹ cũng đọc vài bài thơ trước khi ngủ.',
        facts: [
          { kind: 'tu-hao', text: 'Mẹ tự hào vì đã tự đi làm đỡ đần bà ngoại từ năm 18 tuổi.' },
          { kind: 'thich', text: 'Mẹ thích đọc thơ Xuân Quỳnh trước khi ngủ.' },
          { kind: 'ky-niem', text: 'Mẹ từng đỗ sư phạm văn năm 1992 nhưng không đi học.' },
          { kind: 'mong', text: 'Mẹ mong Lan học xong sẽ tự chọn nơi mình muốn sống, dù gần hay xa.' },
        ],
        suggestion: 'Đọc một bài thơ Xuân Quỳnh bằng giọng của bạn, hẹn mẹ nghe vào sáng mai.',
        questionId: 'q1', storyId: 's1', followUp: 'Bài thơ đầu tiên cô định dạy học trò là bài nào ạ?', shared: 'clip',
        quiz: [
          { q: 'Năm 18 tuổi, mẹ từng mơ làm nghề gì?', options: ['Cô giáo dạy văn', 'Thợ may', 'Y tá', 'Kế toán'], answer: 0 },
          { q: 'Tối nào trước khi ngủ mẹ cũng làm gì?', options: ['Xem thời sự', 'Đọc thơ', 'Gọi cho bà', 'Tưới cây'], answer: 1 },
        ],
      },
      {
        id: 'L2', speakerId: 'bo', forIds: ['lan', 'nam'], createdAt: daysAgo(10), callSec: 418, highlightSec: 36,
        title: 'Bố đạp xe chậm nhất có thể', quote: 'Bố đạp chậm nhất có thể.',
        summary:
          'Bố kể bố mẹ quen nhau ở hội làng năm 1996. Bố đứng sau mẹ cả buổi hát chèo mà không dám nói câu nào, rồi mượn cớ trời tối để đèo mẹ về. Ba tháng sau bố mới dám viết thư.',
        facts: [
          { kind: 'ky-niem', text: 'Bố mẹ quen nhau ở hội làng năm 1996, hôm có hát chèo.' },
          { kind: 'thich', text: 'Bố thích nghe hát chèo, nhất là trích đoạn Quan Âm Thị Kính.' },
          { kind: 'tu-hao', text: 'Bố tự hào nhất là mấy chậu lan Lan trồng giờ đã ra hoa.' },
          { kind: 'lo', text: 'Bố lo nhất là sức khoẻ của bà ngoại mỗi khi trời trở lạnh.' },
        ],
        suggestion: 'Hỏi bố lá thư đầu tiên giờ còn không. Biết đâu bố mẹ vẫn giữ.',
        questionId: 'q2', storyId: 's2', followUp: 'Lá thư đầu tiên chú viết cho cô có câu gì ạ?', shared: 'clip',
        quiz: [
          { q: 'Bố mẹ quen nhau ở đâu?', options: ['Nhà máy dệt', 'Hội làng', 'Trường học', 'Chợ Rồng'], answer: 1 },
          { q: 'Bao lâu sau bố mới dám viết thư cho mẹ?', options: ['Một tuần', 'Ba tháng', 'Một năm', 'Ngay hôm sau'], answer: 1 },
        ],
      },
      {
        id: 'L3', speakerId: 'ba', forIds: ['lan', 'me', 'nam', 'bo'], createdAt: daysAgo(25), callSec: 512, highlightSec: 52,
        title: 'Bát nước chè ở đầu chợ Rồng', quote: 'Bát nước chè xanh ở đầu chợ là phần thưởng của bà.',
        summary:
          'Bà kể những năm gánh chuối lên chợ Rồng từ ba giờ sáng, mỗi gánh gần năm chục cân. Hôm nào bán hết sớm, bà được ngồi uống bát chè xanh ở đầu chợ.',
        facts: [
          { kind: 'ky-niem', text: 'Từ năm 1975 bà gánh chuối lên chợ Rồng từ ba giờ sáng.' },
          { kind: 'thich', text: 'Bà thích nước chè xanh pha thật đặc.' },
          { kind: 'mong', text: 'Bà mong Tết này cả nhà về đủ mặt.' },
        ],
        suggestion: 'Tết này về, pha cho bà một ấm chè xanh thật đặc.', storyId: 's4',
        followUp: 'Bà bán ở chợ Rồng bao nhiêu năm hả bà?', shared: 'summary',
        quiz: [{ q: 'Ngày xưa bà gánh gì lên chợ Rồng?', options: ['Gạo', 'Chuối', 'Cá', 'Rau muống'], answer: 1 }],
      },
      {
        id: 'L4', speakerId: 'lan', forIds: ['me', 'bo'], createdAt: daysAgo(5), callSec: 384, highlightSec: 31,
        title: 'Lan nhớ nhà nhất vào tối thứ Sáu', quote: 'Tối thứ Sáu cả ký túc xá về nhà, chỉ còn con với cái nồi cơm điện.',
        summary:
          'Lan kể tối thứ Sáu là lúc khó nhất, vì bạn bè về nhà hết. Lan đã tự nấu canh chua bằng chanh thay me, và đang làm thêm ở quán cà phê hai buổi một tuần. Lan ít kể vì không muốn bố mẹ lo.',
        facts: [
          { kind: 'lo', text: 'Lan lo bài báo cáo cuối kỳ và tiền nhà tháng 12.' },
          { kind: 'thich', text: 'Lan thích gọi video lúc mẹ đang nấu cơm.' },
          { kind: 'ky-niem', text: 'Lan nấu canh chua bằng chanh thay me, cả phòng khen ngon.' },
          { kind: 'mong', text: 'Lan mong tối thứ Sáu được nói chuyện với bố mẹ lâu hơn.' },
        ],
        suggestion: 'Tối thứ Sáu này gọi video cho Lan lúc 18:00 giờ Việt Nam, đúng lúc mẹ nấu cơm.',
        questionId: 'q5', followUp: 'Quán cà phê Lan làm thêm có ai là bạn thân không?', shared: 'summary',
        quiz: [{ q: 'Lúc nào trong tuần Lan nhớ nhà nhất?', options: ['Sáng thứ Hai', 'Tối thứ Sáu', 'Trưa Chủ nhật', 'Lúc đi thi'], answer: 1 }],
      },
      {
        id: 'L5', speakerId: 'nam', forIds: ['bo', 'me'], createdAt: daysAgo(1), callSec: 296, highlightSec: 27,
        title: 'Nam đang học thêm vẽ', quote: 'Con vẫn thích kinh tế, nhưng lúc vẽ con thấy mình là mình nhất.',
        summary:
          'Nam kể dạo này buổi tối Nam học thêm thiết kế đồ hoạ, và vừa được giải ba cuộc thi poster của trường. Nam chưa kể vì sợ bố mẹ nghĩ Nam bỏ bê việc học chính.',
        facts: [
          { kind: 'tu-hao', text: 'Nam vừa được giải ba cuộc thi poster của trường.' },
          { kind: 'lo', text: 'Nam lo bố mẹ nghĩ Nam bỏ bê việc học chính.' },
          { kind: 'mong', text: 'Nam mong bố xem thử những bài Nam vẽ.' },
        ],
        suggestion: 'Nhắn Nam xin xem tấm poster được giải. Chưa cần hỏi chuyện học hành vội.',
        questionId: 'q6', followUp: 'Tấm poster được giải của Nam vẽ về cái gì?', shared: 'softened',
        quiz: [{ q: 'Nam vừa được giải gì ở trường?', options: ['Giải nhất toán', 'Giải ba poster', 'Học bổng', 'Giải bóng đá'], answer: 1 }],
      },
    ],
    films: [
      {
        id: 'f1', title: 'Chuyện bố mẹ quen nhau', speakerId: 'bo', occasion: 'Video tuần này', createdAt: hoursAgo(3), durationSec: 40,
        letterId: 'L2', storyId: 's2',
        scenes: [{ caption: 'Hội làng có hát chèo', year: 1996 }, { caption: 'Con đường từ đình về nhà', year: 1996 }, { caption: 'Ảnh cưới của bố mẹ', year: 1999 }],
        subs: [
          { at: 0, vi: 'Hội làng năm ấy có hát chèo.', ko: '그해 마을 축제에는 체오 공연이 있었단다.', en: 'That year the village festival had chèo opera.' },
          { at: 6, vi: 'Bố đứng sau mẹ cả buổi mà không dám nói câu nào.', ko: '아빠는 저녁 내내 엄마 뒤에 서 있었는데 한마디도 못 했어.', en: 'I stood behind your mother all evening and never said a word.' },
          { at: 15, vi: 'Lúc tan hội, bố mượn cớ trời tối để đèo mẹ về.', ko: '축제가 끝나자 날이 어둡다는 핑계로 엄마를 자전거에 태워 줬지.', en: 'When it ended, I used the dark as an excuse to ride her home.' },
          { at: 24, vi: 'Bố đạp chậm nhất có thể.', ko: '아빠는 최대한 천천히 페달을 밟았어.', en: 'I pedalled as slowly as I possibly could.' },
          { at: 31, vi: 'Ba năm sau, bố mẹ cưới nhau.', ko: '3년 뒤, 엄마 아빠는 결혼했단다.', en: 'Three years later, we got married.' },
        ],
      },
      {
        id: 'f2', title: 'Bát nước chè ở đầu chợ Rồng', speakerId: 'ba', occasion: 'Video tuần trước', createdAt: daysAgo(6), durationSec: 34,
        letterId: 'L3', storyId: 's4',
        scenes: [{ caption: 'Chợ Rồng, Nam Định', year: 1975 }, { caption: 'Gánh chuối lúc ba giờ sáng' }, { caption: 'Bát chè xanh đầu chợ' }],
        subs: [
          { at: 0, vi: 'Ngày ấy bà gánh chuối lên chợ Rồng từ ba giờ sáng.', ko: '그 시절 할머니는 새벽 세 시부터 바나나를 지고 롱 시장에 갔단다.', en: 'Back then I carried bananas to Rồng market from three in the morning.' },
          { at: 9, vi: 'Một gánh nặng gần năm chục cân.', ko: '한 짐이 50킬로그램 가까이 됐지.', en: 'Each load weighed almost fifty kilos.' },
          { at: 17, vi: 'Hôm nào bán hết sớm, bà được ngồi uống bát chè xanh ở đầu chợ.', ko: '일찍 다 판 날에는 시장 입구에서 녹차 한 사발을 마셨어.', en: 'On days I sold out early, I sat and drank green tea at the market gate.' },
          { at: 27, vi: 'Đó là phần thưởng của bà.', ko: '그게 할머니의 상이었단다.', en: 'That was my reward.' },
        ],
      },
    ],
    messages: [
      { id: 'fm1', authorId: 'bo', createdAt: hoursAgo(26), text: 'Bố vừa sửa xong cái xe đạp cũ của Lan, để đấy Tết về đi.' },
      { id: 'fm2', authorId: 'lan', createdAt: hoursAgo(25.5), text: 'Ôi xe của con! Bố chụp cho con xem với.' },
      { id: 'fm3', authorId: 'ba', createdAt: hoursAgo(25), voiceSec: 21, text: 'Trời trở lạnh rồi, các cháu nhớ mặc ấm vào.' },
      { id: 'fm10', authorId: 'me', createdAt: hoursAgo(22), to: ['lan'], replyToLetterId: 'L4', voiceSec: 16, text: 'Mẹ nghe chuyện tối thứ Sáu của con rồi. Thứ Sáu này mẹ gọi con lúc mẹ nấu cơm nhé.' },
      { id: 'fm8', authorId: 'lan', createdAt: hoursAgo(14), to: ['me', 'bo'], deliverAt: thisMorningVN, heardBy: ['bo'], voiceSec: 12, text: 'Con chào bố mẹ. Tối qua con ngủ sớm, sáng nay con đi học rồi nhé.' },
      { id: 'fm6', authorId: 'me', createdAt: hoursAgo(15), to: ['lan'], deliverAt: thisMorningKR, voiceSec: 18, text: 'Chào buổi sáng con gái. Hôm nay nộp báo cáo phải không? Ăn sáng rồi hẵng đi nhé.' },
      { id: 'fm11', authorId: 'ai', createdAt: hoursAgo(3), filmId: 'f1' },
      { id: 'fm4', authorId: 'me', createdAt: hoursAgo(2.2), postId: 'p2', voiceSec: 14, text: 'Ở thư viện đến mấy giờ hả con? Nhớ ăn tối đấy.' },
      { id: 'fm5', authorId: 'nam', createdAt: hoursAgo(1.5), text: 'Tối nay cả nhà gọi video không? Con rảnh sau 9 giờ.' },
      { id: 'fm9', authorId: 'lan', createdAt: hoursAgo(0.3), to: ['bo'], deliverAt: tomorrowVN, voiceSec: 9, text: 'Bố ơi, chúc bố một ngày làm vườn vui. Con thương bố.' },
      { id: 'fm12', authorId: 'ai', createdAt: daysAgo(3), letterId: 'L1' },
      { id: 'fm13', authorId: 'ai', createdAt: daysAgo(5), letterId: 'L4' },
      { id: 'fm14', authorId: 'ai', createdAt: daysAgo(1), letterId: 'L5' },
      { id: 'fm15', authorId: 'ai', createdAt: daysAgo(6), filmId: 'f2' },
    ],
    missions: [
      { id: 'm1', ids: ['lan', 'me'], action: 'voice', text: 'Lan đọc một bài thơ Xuân Quỳnh, hẹn gửi mẹ nghe vào sáng mai.', why: 'Mẹ kể tối nào mẹ cũng đọc thơ Xuân Quỳnh.' },
      { id: 'm2', ids: ['bo', 'nam'], action: 'photo', text: 'Bố gửi Nam một tấm ảnh hồi bố bằng tuổi Nam, Nam hỏi bố một câu về tấm ảnh.', why: 'Bố và Nam đã 12 ngày chưa nói chuyện riêng.' },
      { id: 'm3', ids: ['lan', 'ba'], action: 'call', text: 'Lan gọi video cho bà, nhờ bà chỉ cách pha chè xanh.', why: 'Bà kể bát chè xanh đầu chợ là phần thưởng của bà.' },
      { id: 'm4', ids: ['me', 'nam'], action: 'call', text: 'Mẹ gọi video cho Nam, xin xem tấm poster Nam vừa được giải.', why: 'Nam mong bố mẹ xem những bài Nam vẽ.' },
    ],
    events: [
      { id: 'e2', title: 'Sinh nhật mẹ', kind: 'birthday', calendar: 'lunar', day: 12, month: 3, year: 1974, memberId: 'me', remindDaysBefore: 7 },
      { id: 'e3', title: 'Sinh nhật bố', kind: 'birthday', calendar: 'solar', day: 5, month: 9, year: 1971, memberId: 'bo', remindDaysBefore: 7 },
      { id: 'e5', title: 'Sinh nhật bà ngoại', kind: 'birthday', calendar: 'lunar', day: 8, month: 8, year: 1948, memberId: 'ba', remindDaysBefore: 7 },
      { id: 'e6', title: 'Sinh nhật Nam', kind: 'birthday', calendar: 'solar', day: 2, month: 12, year: 2005, memberId: 'nam', remindDaysBefore: 5 },
      { id: 'e9', title: 'Sinh nhật Lan', kind: 'birthday', calendar: 'solar', day: 14, month: 7, year: 2002, memberId: 'lan', storyId: 's3', remindDaysBefore: 5 },
      { id: 'e4', title: 'Giỗ ông ngoại', kind: 'gio', calendar: 'lunar', day: 15, month: 11, note: 'Về được thì về, không thì gọi video lúc cả nhà thắp hương', remindDaysBefore: 10 },
      { id: 'e7', title: 'Ngày cưới bố mẹ', kind: 'anniversary', calendar: 'solar', day: 18, month: 11, year: 1999, storyId: 's2', remindDaysBefore: 5, idea: 'Homeletter làm video "Chuyện bố mẹ quen nhau" để cả nhà cùng xem.' },
      { id: 'e10', title: 'Lan vào lớp Một', kind: 'milestone', calendar: 'solar', day: 5, month: 9, year: 2008, once: true, memberId: 'lan', remindDaysBefore: 0 },
      { id: 'e11', title: 'Nam vào đại học', kind: 'milestone', calendar: 'solar', day: 1, month: 9, year: 2023, once: true, memberId: 'nam', remindDaysBefore: 0 },
      { id: 'e12', title: 'Lan sang Hàn du học', kind: 'milestone', calendar: 'solar', day: 24, month: 2, year: 2025, memberId: 'lan', remindDaysBefore: 3, idea: 'Mỗi năm một lần: cả nhà gửi Lan một lời chào buổi sáng.' },
      { id: 'e13', title: 'Lan tốt nghiệp thạc sĩ', kind: 'milestone', calendar: 'solar', day: 20, month: 2, year: 2027, once: true, memberId: 'lan', remindDaysBefore: 14 },
    ],
    calls: { me: hoursAgo(26), bo: daysAgo(4), ba: daysAgo(9), nam: daysAgo(3) },
    settings: { parentMode: false, notifications: true, aiCalls: true, aiCallDay: 'sun', holidays: true, premium: false },
  };
}
