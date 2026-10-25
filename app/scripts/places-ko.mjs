// Thêm tên tiếng Hàn vào src/places.json (chạy lại được, không gọi mạng), chạy SAU places-en.mjs: node scripts/places-ko.mjs
// Mỗi địa danh thêm phần tử thứ 8 `ko` (phần tử thứ 7 là tên Anh, rỗng nếu trùng tên Việt); `cko` là tên nước tiếng Hàn theo mã nước.
// Khóa bảng là tên Việt (trường đầu của places.json). Thiếu tên Hàn thì script báo lỗi, không ghi file.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../src/places.json', import.meta.url);
const j = JSON.parse(readFileSync(file, 'utf8'));

const CKO = {
  VN: '베트남', KR: '한국', JP: '일본', TW: '대만', CN: '중국', HK: '홍콩', MO: '마카오', TH: '태국', MY: '말레이시아', SG: '싱가포르',
  ID: '인도네시아', PH: '필리핀', KH: '캄보디아', LA: '라오스', MM: '미얀마', IN: '인도', AU: '호주', NZ: '뉴질랜드', US: '미국', CA: '캐나다',
  GB: '영국', FR: '프랑스', DE: '독일', NL: '네덜란드', BE: '벨기에', CH: '스위스', IT: '이탈리아', ES: '스페인', PT: '포르투갈', PL: '폴란드',
  CZ: '체코', RU: '러시아', NO: '노르웨이', SE: '스웨덴', FI: '핀란드', DK: '덴마크', IE: '아일랜드', AE: '아랍에미리트', QA: '카타르', SA: '사우디아라비아', TR: '튀르키예',
  IL: '이스라엘', ZA: '남아프리카공화국', AT: '오스트리아', GR: '그리스', MN: '몽골', BN: '브루나이',
};

const KO = {
  // Việt Nam
  'Hà Nội': '하노이', 'TP. Hồ Chí Minh': '호찌민', 'Hải Phòng': '하이퐁', 'Đà Nẵng': '다낭', 'Cần Thơ': '껀터', 'An Giang': '안장',
  'Bà Rịa - Vũng Tàu': '바리어붕따우', 'Bắc Giang': '박장', 'Bắc Kạn': '박깐', 'Bạc Liêu': '박리에우', 'Bắc Ninh': '박닌', 'Bến Tre': '벤째',
  'Bình Định': '빈딘', 'Bình Dương': '빈즈엉', 'Bình Phước': '빈프억', 'Bình Thuận': '빈투언', 'Cà Mau': '까마우', 'Cao Bằng': '까오방',
  'Đắk Lắk': '닥락', 'Đắk Nông': '닥농', 'Điện Biên': '디엔비엔', 'Đồng Nai': '동나이', 'Đồng Tháp': '동탑', 'Gia Lai': '자라이',
  'Hà Giang': '하장', 'Hà Nam': '하남', 'Hà Tĩnh': '하띤', 'Hải Dương': '하이즈엉', 'Hậu Giang': '허우장', 'Hòa Bình': '호아빈',
  'Hưng Yên': '흥옌', 'Khánh Hòa': '칸호아', 'Kiên Giang': '끼엔장', 'Kon Tum': '꼰뚬', 'Lai Châu': '라이쩌우', 'Lâm Đồng': '럼동',
  'Lạng Sơn': '랑선', 'Lào Cai': '라오까이', 'Long An': '롱안', 'Nam Định': '남딘', 'Nghệ An': '응에안', 'Ninh Bình': '닌빈',
  'Ninh Thuận': '닌투언', 'Phú Thọ': '푸토', 'Phú Yên': '푸옌', 'Quảng Bình': '꽝빈', 'Quảng Nam': '꽝남', 'Quảng Ngãi': '꽝응아이',
  'Quảng Ninh': '꽝닌', 'Quảng Trị': '꽝찌', 'Sóc Trăng': '속짱', 'Sơn La': '선라', 'Tây Ninh': '떠이닌', 'Thái Bình': '타이빈',
  'Thái Nguyên': '타이응우옌', 'Thanh Hóa': '탄호아', 'Thừa Thiên Huế': '투아티엔후에', 'Tiền Giang': '띠엔장', 'Trà Vinh': '짜빈',
  'Tuyên Quang': '뚜옌꽝', 'Vĩnh Long': '빈롱', 'Vĩnh Phúc': '빈푹', 'Yên Bái': '옌바이', 'Nha Trang': '나트랑', 'Đà Lạt': '달랏',
  'Vũng Tàu': '붕따우', 'Biên Hòa': '비엔호아', 'Thủ Đức': '투득', 'Buôn Ma Thuột': '부온마투옷', 'Quy Nhơn': '꾸이년', 'Vinh': '빈',
  'Huế': '후에', 'Hội An': '호이안', 'Phú Quốc': '푸꾸옥', 'Long Thành': '롱타인', 'Dĩ An': '지안', 'Thuận An': '투언안', 'Sa Pa': '사파',
  // Hàn Quốc
  Seoul: '서울', Busan: '부산', Incheon: '인천', Daegu: '대구', Daejeon: '대전', Gwangju: '광주', Ulsan: '울산', Sejong: '세종', Suwon: '수원',
  Seongnam: '성남', Goyang: '고양', Yongin: '용인', Changwon: '창원', Cheongju: '청주', Jeonju: '전주', Jeju: '제주', Seogwipo: '서귀포',
  Pohang: '포항', Gimhae: '김해', Gumi: '구미', Asan: '아산', Cheonan: '천안', Chungju: '충주', Gangneung: '강릉', Wonju: '원주',
  Chuncheon: '춘천', Ansan: '안산', Bucheon: '부천', Anyang: '안양', Hwaseong: '화성', Pyeongtaek: '평택', Siheung: '시흥', Gimpo: '김포',
  Paju: '파주', Uijeongbu: '의정부', Namyangju: '남양주', Gwangmyeong: '광명', Gunpo: '군포', Hanam: '하남', Icheon: '이천', Osan: '오산',
  Yangju: '양주', Jinju: '진주', Yangsan: '양산', Gyeongju: '경주', Andong: '안동', Gyeongsan: '경산', Mokpo: '목포', Yeosu: '여수',
  Suncheon: '순천', Gunsan: '군산', Iksan: '익산', Sokcho: '속초', Donghae: '동해', Jecheon: '제천', Eumseong: '음성', Jincheon: '진천',
  Nonsan: '논산', Seosan: '서산', Dangjin: '당진', Tongyeong: '통영', Geoje: '거제', Miryang: '밀양', Sacheon: '사천', Gimcheon: '김천',
  // Nhật Bản
  Tokyo: '도쿄', Osaka: '오사카', Nagoya: '나고야', Fukuoka: '후쿠오카', Sapporo: '삿포로', Kyoto: '교토', Yokohama: '요코하마', Kobe: '고베',
  Hiroshima: '히로시마', Sendai: '센다이', Kawasaki: '가와사키', Saitama: '사이타마', Chiba: '지바', Nara: '나라', 'Naha (Okinawa)': '나하(오키나와)',
  Kitakyushu: '기타큐슈', Niigata: '니가타', Shizuoka: '시즈오카', Hamamatsu: '하마마쓰', Kumamoto: '구마모토', Kagoshima: '가고시마',
  Okayama: '오카야마', Matsuyama: '마쓰야마', Kanazawa: '가나자와', Nagasaki: '나가사키', Utsunomiya: '우쓰노미야', Gifu: '기후', Toyota: '도요타',
  Sakai: '사카이', Himeji: '히메지', Tsukuba: '쓰쿠바',
  // Đài Loan, Trung Quốc, Hồng Kông, Ma Cao
  'Đài Bắc': '타이베이', 'Tân Bắc': '신베이', 'Đào Viên': '타오위안', 'Đài Trung': '타이중', 'Đài Nam': '타이난', 'Cao Hùng': '가오슝',
  'Tân Trúc': '신주', 'Cơ Long': '지룽', 'Gia Nghĩa': '자이', 'Chương Hóa': '장화', 'Bình Đông': '핑둥', 'Hoa Liên': '화롄', 'Nghi Lan': '이란', 'Miêu Lật': '먀오리',
  'Bắc Kinh': '베이징', 'Thượng Hải': '상하이', 'Quảng Châu': '광저우', 'Thâm Quyến': '선전', 'Thành Đô': '청두', 'Hàng Châu': '항저우',
  'Nam Kinh': '난징', 'Vũ Hán': '우한', 'Trùng Khánh': '충칭', 'Tây An': '시안', 'Thiên Tân': '톈진', 'Thẩm Dương': '선양', 'Đại Liên': '다롄',
  'Thanh Đảo': '칭다오', 'Hạ Môn': '샤먼', 'Tô Châu': '쑤저우', 'Trường Sa': '창사', 'Trịnh Châu': '정저우', 'Côn Minh': '쿤밍', 'Quế Lâm': '구이린',
  'Nam Ninh': '난닝', 'Phúc Châu': '푸저우', 'Cáp Nhĩ Tân': '하얼빈', 'Tế Nam': '지난', 'Đông Hoản': '둥관', 'Phật Sơn': '포산', 'Ninh Ba': '닝보',
  'Hồng Kông': '홍콩', 'Ma Cao': '마카오',
  // Đông Nam Á, Ấn Độ
  Bangkok: '방콕', 'Chiang Mai': '치앙마이', Phuket: '푸껫', Pattaya: '파타야', 'Khon Kaen': '콘깬', 'Hat Yai': '핫야이',
  'Kuala Lumpur': '쿠알라룸푸르', 'Johor Bahru': '조호르바루', 'Penang (George Town)': '페낭(조지타운)', 'Kota Kinabalu': '코타키나발루', Kuching: '쿠칭',
  Ipoh: '이포', Malacca: '말라카', 'Shah Alam': '샤알람', Singapore: '싱가포르',
  Jakarta: '자카르타', Surabaya: '수라바야', Bandung: '반둥', Medan: '메단', 'Bali (Denpasar)': '발리(덴파사르)', Yogyakarta: '족자카르타',
  Semarang: '스마랑', Makassar: '마카사르', Batam: '바탐',
  Manila: '마닐라', 'Quezon City': '케손시티', Cebu: '세부', Davao: '다바오', Makati: '마카티', Baguio: '바기오', Angeles: '앙헬레스',
  'Phnom Penh': '프놈펜', 'Siem Reap': '씨엠립', Sihanoukville: '시아누크빌', Battambang: '바탐방',
  'Viêng Chăn': '비엔티안', 'Luang Prabang': '루앙프라방', Savannakhet: '사반나케트', Pakse: '팍세',
  Yangon: '양곤', Naypyidaw: '네피도', Mandalay: '만달레이',
  'New Delhi': '뉴델리', Mumbai: '뭄바이', Bangalore: '벵갈루루', Chennai: '첸나이', Kolkata: '콜카타', Hyderabad: '하이데라바드', Pune: '푸네',
  Ahmedabad: '아마다바드', Jaipur: '자이푸르',
  // Úc, New Zealand
  Sydney: '시드니', Melbourne: '멜버른', Brisbane: '브리즈번', Perth: '퍼스', Adelaide: '애들레이드', Canberra: '캔버라', 'Gold Coast': '골드코스트',
  Hobart: '호바트', Darwin: '다윈', Newcastle: '뉴캐슬', Wollongong: '울런공',
  Auckland: '오클랜드', Wellington: '웰링턴', Christchurch: '크라이스트처치', Hamilton: '해밀턴', Queenstown: '퀸스타운', Dunedin: '더니든',
  // Mỹ
  'New York': '뉴욕', 'Los Angeles': '로스앤젤레스', 'San Jose': '새너제이', 'San Francisco': '샌프란시스코', Seattle: '시애틀', Houston: '휴스턴',
  Dallas: '댈러스', Atlanta: '애틀랜타', Chicago: '시카고', Boston: '보스턴', 'Washington DC': '워싱턴 D.C.', 'Westminster (Orange County)': '웨스트민스터(오렌지카운티)',
  'Santa Ana': '샌타애나', 'Garden Grove': '가든그로브', Anaheim: '애너하임', Irvine: '어바인', 'San Diego': '샌디에이고', Sacramento: '새크라멘토',
  Oakland: '오클랜드', Philadelphia: '필라델피아', Miami: '마이애미', Denver: '덴버', Phoenix: '피닉스', 'Las Vegas': '라스베이거스', Austin: '오스틴',
  'San Antonio': '샌안토니오', 'Fort Worth': '포트워스', Orlando: '올랜도', Tampa: '탬파', Detroit: '디트로이트', Minneapolis: '미니애폴리스',
  'Portland (Oregon)': '포틀랜드(오리건)', 'Salt Lake City': '솔트레이크시티', Honolulu: '호놀룰루', Anchorage: '앵커리지',
  'Birmingham (Alabama)': '버밍엄(앨라배마)', 'Little Rock': '리틀록', Bridgeport: '브리지포트', Wilmington: '윌밍턴', Jacksonville: '잭슨빌',
  Boise: '보이시', Indianapolis: '인디애나폴리스', 'Des Moines': '디모인', Wichita: '위치타', Louisville: '루이빌', 'New Orleans': '뉴올리언스',
  'Portland (Maine)': '포틀랜드(메인)', Baltimore: '볼티모어', Jackson: '잭슨', 'Kansas City': '캔자스시티', Billings: '빌링스', Omaha: '오마하',
  'Manchester (New Hampshire)': '맨체스터(뉴햄프셔)', Newark: '뉴어크', Albuquerque: '앨버커키', Charlotte: '샬럿', Fargo: '파고', Columbus: '콜럼버스',
  'Oklahoma City': '오클라호마시티', Pittsburgh: '피츠버그', Providence: '프로비던스', 'Charleston (South Carolina)': '찰스턴(사우스캐롤라이나)',
  'Sioux Falls': '수폴스', Nashville: '내슈빌', Memphis: '멤피스', 'Burlington (Vermont)': '벌링턴(버몬트)', 'Virginia Beach': '버지니아비치',
  'Richmond (Virginia)': '리치먼드(버지니아)', 'Charleston (West Virginia)': '찰스턴(웨스트버지니아)', Milwaukee: '밀워키', Cheyenne: '샤이엔',
  Cleveland: '클리블랜드', Cincinnati: '신시내티', 'St. Louis': '세인트루이스', Raleigh: '롤리', Fairfax: '페어팩스', 'Falls Church': '폴스처치',
  'Arlington (Virginia)': '알링턴(버지니아)', 'Arlington (Texas)': '알링턴(텍사스)', Garland: '갈런드', Plano: '플레이노', Irving: '어빙',
  'Sugar Land': '슈거랜드', Fresno: '프레즈노', 'Long Beach': '롱비치', 'San Gabriel': '샌게이브리얼', Rosemead: '로즈미드', 'El Monte': '엘몬티',
  Fremont: '프리몬트', Milpitas: '밀피타스', 'Santa Clara': '샌타클래라', Sunnyvale: '서니베일', Tacoma: '타코마', Bellevue: '벨뷰', Lowell: '로웰',
  // Canada
  Toronto: '토론토', Vancouver: '밴쿠버', 'Montréal': '몬트리올', Calgary: '캘거리', Ottawa: '오타와', Edmonton: '에드먼턴', Winnipeg: '위니펙',
  Quebec: '퀘벡', Halifax: '핼리팩스', Mississauga: '미시소거', 'Hamilton (Ontario)': '해밀턴(온타리오)', Victoria: '빅토리아', Saskatoon: '서스커툰',
  Regina: '리자이나', 'London (Ontario)': '런던(온타리오)', Kitchener: '키치너', Surrey: '서리',
  // Châu Âu
  London: '런던', Manchester: '맨체스터', Birmingham: '버밍엄', Liverpool: '리버풀', Leeds: '리즈', Glasgow: '글래스고', Edinburgh: '에든버러',
  Bristol: '브리스톨', Cardiff: '카디프', Belfast: '벨파스트', Sheffield: '셰필드', 'Newcastle upon Tyne': '뉴캐슬', Nottingham: '노팅엄',
  Oxford: '옥스퍼드', Cambridge: '케임브리지',
  Paris: '파리', Marseille: '마르세유', Lyon: '리옹', Toulouse: '툴루즈', Nice: '니스', Nantes: '낭트', Strasbourg: '스트라스부르',
  Bordeaux: '보르도', Lille: '릴', Montpellier: '몽펠리에', Rennes: '렌',
  Berlin: '베를린', 'München': '뮌헨', Frankfurt: '프랑크푸르트', Hamburg: '함부르크', 'Köln': '쾰른', 'Düsseldorf': '뒤셀도르프',
  Stuttgart: '슈투트가르트', Leipzig: '라이프치히', Dresden: '드레스덴', Hannover: '하노버', 'Nürnberg': '뉘른베르크', Bremen: '브레멘',
  Dortmund: '도르트문트', Essen: '에센', Heidelberg: '하이델베르크', Bonn: '본',
  Amsterdam: '암스테르담', Rotterdam: '로테르담', 'Den Haag': '헤이그', Utrecht: '위트레흐트', Eindhoven: '에인트호번',
  Brussels: '브뤼셀', Antwerp: '앤트워프', Ghent: '헨트',
  'Zürich': '취리히', Geneva: '제네바', Bern: '베른', Basel: '바젤',
  Roma: '로마', Milano: '밀라노', Napoli: '나폴리', Torino: '토리노', Firenze: '피렌체', Venezia: '베네치아', Bologna: '볼로냐',
  Madrid: '마드리드', Barcelona: '바르셀로나', Valencia: '발렌시아', Sevilla: '세비야', Bilbao: '빌바오',
  Lisbon: '리스본', Porto: '포르투',
  Warsaw: '바르샤바', 'Kraków': '크라쿠프', 'Wrocław': '브로츠와프', 'Gdańsk': '그단스크', 'Poznań': '포즈난',
  Praha: '프라하', Brno: '브르노',
  Moskva: '모스크바', 'Sankt-Peterburg': '상트페테르부르크', Vladivostok: '블라디보스토크', Novosibirsk: '노보시비르스크', Kazan: '카잔',
  Oslo: '오슬로', Bergen: '베르겐', Stockholm: '스톡홀름', 'Göteborg': '예테보리', 'Malmö': '말뫼', Helsinki: '헬싱키', Tampere: '탐페레',
  Copenhagen: '코펜하겐', Aarhus: '오르후스', Dublin: '더블린', Cork: '코크', Wien: '빈', Athens: '아테네',
  // Trung Đông, châu Phi, Mông Cổ, Brunei
  Dubai: '두바이', 'Abu Dhabi': '아부다비', Sharjah: '샤르자', Doha: '도하', Riyadh: '리야드', Jeddah: '제다',
  Istanbul: '이스탄불', Ankara: '앙카라', Izmir: '이즈미르', 'Tel Aviv': '텔아비브', Jerusalem: '예루살렘',
  Johannesburg: '요하네스버그', 'Cape Town': '케이프타운', Durban: '더반', Ulaanbaatar: '울란바토르', 'Bandar Seri Begawan': '반다르스리브가완',
};

const missing = j.p.filter((p) => !KO[p[0]]).map((p) => `${p[0]} (${p[1]})`);
const missingC = Object.keys(j.c).filter((c) => !CKO[c]);
if (missing.length || missingC.length) throw new Error(`Thiếu tên Hàn: ${[...missing, ...missingC].join(', ')}`);

// Phần tử thứ 7 giữ tên Anh (rỗng khi không có, app dùng tên Việt), phần tử thứ 8 là tên Hàn.
j.p = j.p.map((p) => [...p.slice(0, 6), p[6] ?? '', KO[p[0]]]);
j.cko = Object.fromEntries(Object.keys(j.c).map((c) => [c, CKO[c]]));
writeFileSync(file, JSON.stringify(j));
console.log(`Thêm tên tiếng Hàn cho ${j.p.length}/${j.p.length} địa danh, ${Object.keys(j.cko).length} nước. Chưa có tên Hàn: 0.`);
