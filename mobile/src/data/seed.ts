import type { AppState, Chapter } from './types';

// Dữ liệu mẫu cho bản demo: gia đình chị Lan, du học sinh thạc sĩ ở Seoul,
// bố mẹ ở Nam Định, em trai học đại học ở Hà Nội.

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
  return {
    onboarded: false,
    signedIn: false,
    meId: 'lan',
    family: {
      id: 'fam-1',
      name: 'Nhà mình',
      inviteCode: 'NHA-2611',
      members: [
        {
          id: 'lan', name: 'Nguyễn Thu Lan', role: 'con', roleLabel: 'Con gái', city: 'Seoul', country: 'KR',
          birthday: { calendar: 'solar', day: 14, month: 7, year: 2002 }, awaySince: '2025-02-24', lastActiveAt: hoursAgo(0.2),
        },
        {
          id: 'me', name: 'Trần Thị Hoa', role: 'me', roleLabel: 'Mẹ', city: 'Nam Định', country: 'VN',
          birthday: { calendar: 'lunar', day: 12, month: 3, year: 1974 }, lastActiveAt: hoursAgo(1),
        },
        {
          id: 'bo', name: 'Nguyễn Văn Minh', role: 'bo', roleLabel: 'Bố', city: 'Nam Định', country: 'VN',
          birthday: { calendar: 'solar', day: 5, month: 9, year: 1971 }, lastActiveAt: hoursAgo(5),
        },
        {
          id: 'nam', name: 'Nguyễn Hoàng Nam', role: 'em', roleLabel: 'Em trai', city: 'Hà Nội', country: 'VN',
          birthday: { calendar: 'solar', day: 2, month: 12, year: 2005 }, awaySince: '2023-09-01', lastActiveAt: daysAgo(2),
        },
        {
          id: 'ba', name: 'Phạm Thị Thảo', role: 'ba', roleLabel: 'Bà ngoại', city: 'Nam Định', country: 'VN',
          birthday: { calendar: 'lunar', day: 8, month: 8, year: 1948 }, lastActiveAt: daysAgo(4),
        },
      ],
    },
    posts: [
      {
        id: 'p1', authorId: 'me', createdAt: hoursAgo(1.2), caption: 'Mâm cơm tối nay: canh cua rau đay, cà pháo. Con ăn cơm chưa?',
        tag: 'an-com', emoji: '🍲', reactions: { bo: '❤️' },
        replies: [{ id: 'r1', authorId: 'bo', text: 'Canh mẹ nấu ngon lắm', createdAt: hoursAgo(1) }],
      },
      {
        id: 'p2', authorId: 'lan', createdAt: hoursAgo(2.5), caption: 'Con ăn kimbap ở thư viện, mai nộp báo cáo rồi',
        tag: 'an-com', emoji: '🍙', reactions: { me: '🥺', bo: '💪' },
        replies: [{ id: 'r2', authorId: 'me', voiceSec: 14, createdAt: hoursAgo(2.2) }],
      },
      {
        id: 'p3', authorId: 'bo', createdAt: hoursAgo(5), caption: 'Mấy chậu lan con trồng trước khi đi đã ra hoa',
        tag: 'khoe', emoji: '🌸', reactions: { lan: '😍', me: '❤️' }, replies: [],
      },
      {
        id: 'p4', authorId: 'nam', createdAt: daysAgo(2), caption: 'Thi xong môn khó nhất kỳ này!',
        tag: 'di-hoc', emoji: '🎓', reactions: { me: '👏' }, replies: [],
      },
      {
        id: 'p5', authorId: 'ba', createdAt: daysAgo(4), caption: 'Bà đi lễ chùa, cầu cho các cháu mạnh khoẻ',
        tag: 'binh-an', emoji: '🏯', reactions: { lan: '❤️', nam: '❤️' }, replies: [],
      },
    ],
    stories: [
      {
        id: 's1', tellerId: 'me', title: 'Ngày đầu đi làm ở nhà máy dệt', chapterId: 'tuoi-tre', year: 1992,
        createdAt: daysAgo(3), durationSec: 372, emoji: '🧵', photoEmojis: ['🏭', '🚲', '🧵'],
        question: 'Hồi trẻ, ngày đầu tiên đi làm của mẹ thế nào?', askedById: 'lan',
        transcript:
          'Năm đó mẹ mười tám tuổi. Mẹ đạp xe mười hai cây số lên nhà máy dệt, đến nơi trời còn chưa sáng. Mẹ ngồi chờ ở cổng mà tim đập thình thịch. Cô Hoa tổ trưởng dẫn mẹ vào xưởng, tiếng máy dệt to đến mức hai người phải hét vào tai nhau. Tháng lương đầu tiên mẹ mua cho bà ngoại một cái khăn len màu đỏ.',
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
      { id: 'q1', fromId: 'lan', toId: 'me', text: 'Hồi trẻ, ngày đầu tiên đi làm của mẹ thế nào?', status: 'answered', storyId: 's1', createdAt: daysAgo(5) },
      { id: 'q2', fromId: 'lan', toId: 'bo', text: 'Bố tỏ tình với mẹ thế nào?', status: 'answered', storyId: 's2', createdAt: daysAgo(12) },
      { id: 'q3', fromId: 'nam', toId: 'bo', text: 'Bố có từng muốn làm nghề khác không?', status: 'pending', createdAt: daysAgo(1) },
      { id: 'q4', fromId: 'lan', toId: 'ba', text: 'Bà ơi, Tết ngày xưa nhà mình làm những món gì?', status: 'asked', createdAt: daysAgo(2) },
    ],
    events: [
      { id: 'e1', title: 'Tết Nguyên Đán', kind: 'tet', calendar: 'lunar', day: 1, month: 1, remindDaysBefore: 21 },
      { id: 'e2', title: 'Sinh nhật mẹ (âm lịch)', kind: 'birthday', calendar: 'lunar', day: 12, month: 3, memberId: 'me', remindDaysBefore: 7 },
      { id: 'e3', title: 'Sinh nhật bố', kind: 'birthday', calendar: 'solar', day: 5, month: 9, memberId: 'bo', remindDaysBefore: 7 },
      { id: 'e4', title: 'Giỗ ông nội', kind: 'gio', calendar: 'lunar', day: 15, month: 11, note: 'Về được thì về, không thì gọi video lúc cả nhà thắp hương', remindDaysBefore: 10 },
      { id: 'e5', title: 'Sinh nhật bà ngoại (âm lịch)', kind: 'birthday', calendar: 'lunar', day: 8, month: 8, memberId: 'ba', remindDaysBefore: 7 },
      { id: 'e6', title: 'Sinh nhật Nam', kind: 'birthday', calendar: 'solar', day: 2, month: 12, memberId: 'nam', remindDaysBefore: 5 },
      { id: 'e7', title: 'Kỷ niệm ngày cưới bố mẹ', kind: 'anniversary', calendar: 'solar', day: 18, month: 11, year: 1999, remindDaysBefore: 5 },
      { id: 'e8', title: 'Rằm tháng Giêng', kind: 'custom', calendar: 'lunar', day: 15, month: 1, remindDaysBefore: 2 },
    ],
    chats: {
      story: [
        {
          id: 'c1', from: 'ai', createdAt: hoursAgo(0.5), kind: 'text',
          text: 'Chào Lan! Tuần này bà ngoại vừa kể chuyện gánh hàng ở chợ Rồng. Lan có muốn kể cho bố mẹ nghe một chuyện của Lan ở Seoul không? Ví dụ: lần đầu Lan tự nấu một món Việt ở bên đó?',
        },
        { id: 'c3', from: 'me', createdAt: hoursAgo(0.4), kind: 'text', text: '', voiceSec: 139 },
        {
          id: 'c4', from: 'ai', createdAt: hoursAgo(0.38), kind: 'save-story',
          text: 'Thư nghe rồi nè. Lần đầu Lan nấu canh chua ở Seoul mà không có me, phải vắt chanh thay, cả phòng ký túc xá khen ngon. Lan muốn lưu chuyện này vào Sổ ký ức để bố mẹ nghe không?',
        },
      ],
      confide: [
        {
          id: 'c2', from: 'ai', createdAt: hoursAgo(0.5), kind: 'text',
          text: 'Đây là góc riêng của Lan. Những gì Lan kể ở đây chỉ mình Thư nghe. Thư chỉ chuyển lời cho bố mẹ khi Lan đồng ý.',
        },
      ],
    },
    capsules: [
      {
        id: 'k1', fromId: 'me', toIds: ['lan'], title: 'Gửi Lan vào ngày cưới', message: '', voiceSec: 204,
        openOn: '2030-06-01', createdAt: daysAgo(20),
      },
      {
        id: 'k2', fromId: 'lan', toIds: ['bo'], title: 'Mừng bố tròn 60 tuổi', message: '', voiceSec: 95,
        openOn: '2031-09-05', createdAt: daysAgo(6),
      },
    ],
    recipes: [
      {
        id: 'rc1', tellerId: 'me', title: 'Canh cua rau đay', emoji: '🍲', minutes: 40, serves: 3,
        ingredients: ['300g cua đồng xay', '1 bó rau đay', '1 quả mướp', 'Mắm tôm, muối, hành khô'],
        steps: [
          'Lọc cua với nước, để lắng, lấy phần nước cua.',
          'Đun nhỏ lửa, khuấy nhẹ một chiều đến khi gạch cua nổi thành mảng.',
          'Cho mướp vào trước, rau đay sau, nêm muối vừa ăn.',
          'Ăn kèm cà pháo và chấm mắm tôm.',
        ],
        tip: 'Khuấy một chiều thôi con, khuấy lung tung là gạch cua vỡ hết.',
        koreaSwaps: ['Cua đồng xay đông lạnh có ở các chợ châu Á tại Ansan, Seoul', 'Rau đay khó tìm: thay bằng mồng tơi (말라바시금치) hoặc rau dền'],
        cookedBy: ['lan'],
      },
      {
        id: 'rc2', tellerId: 'me', title: 'Thịt kho trứng ngày Tết', emoji: '🍖', minutes: 120, serves: 6,
        ingredients: ['1kg thịt ba chỉ', '10 quả trứng vịt', 'Nước mắm, đường, hành tím', 'Nước màu tự thắng'],
        steps: [
          'Thắng đường thành nước màu cánh gián.',
          'Ướp thịt với nước mắm, hành tím trong 30 phút.',
          'Kho lửa thật nhỏ, không mở vung, trong 90 phút.',
          'Cho trứng đã bóc vỏ vào, kho thêm 20 phút.',
        ],
        tip: 'Kho lửa thật nhỏ và không được mở vung.',
        koreaSwaps: ['Thịt ba chỉ 삼겹살 bán sẵn ở mọi siêu thị', 'Trứng vịt khó tìm: dùng trứng gà hoặc trứng cút'],
        cookedBy: [],
      },
    ],
    calls: { me: hoursAgo(26), bo: daysAgo(4), ba: daysAgo(9), nam: daysAgo(3) },
    settings: {
      parentMode: false, language: 'vi', notifications: true, aiCalls: true, aiCallDay: 'sun', nudgeAfterDays: 3, premium: false,
    },
  };
}
