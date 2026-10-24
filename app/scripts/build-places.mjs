// Chạy một lần: node scripts/build-places.mjs  ->  src/places.json
// Lấy toạ độ và múi giờ từ Open-Meteo geocoding, kiểm đúng nước rồi ghi tĩnh. App không gọi API cho các địa danh này.
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const COUNTRY = {
  VN: 'Việt Nam', KR: 'Hàn Quốc', JP: 'Nhật Bản', TW: 'Đài Loan', CN: 'Trung Quốc', HK: 'Hồng Kông', MO: 'Ma Cao', TH: 'Thái Lan', MY: 'Malaysia', SG: 'Singapore',
  ID: 'Indonesia', PH: 'Philippines', KH: 'Campuchia', LA: 'Lào', MM: 'Myanmar', IN: 'Ấn Độ', AU: 'Úc', NZ: 'New Zealand', US: 'Mỹ', CA: 'Canada', GB: 'Anh',
  FR: 'Pháp', DE: 'Đức', NL: 'Hà Lan', BE: 'Bỉ', CH: 'Thụy Sĩ', IT: 'Ý', ES: 'Tây Ban Nha', PT: 'Bồ Đào Nha', PL: 'Ba Lan', CZ: 'Séc', RU: 'Nga', NO: 'Na Uy',
  SE: 'Thụy Điển', FI: 'Phần Lan', DK: 'Đan Mạch', IE: 'Ireland', AE: 'UAE', QA: 'Qatar', SA: 'Ả Rập Xê Út', TR: 'Thổ Nhĩ Kỳ', IL: 'Israel', ZA: 'Nam Phi',
  AT: 'Áo', GR: 'Hy Lạp', MN: 'Mông Cổ', BN: 'Brunei',
};

// Mỗi dòng: MÃ NƯỚC | tên hiển thị | tên tra (có thể "Tên, Tỉnh/Bang" để chọn đúng) | từ khoá thêm
const RAW = `
VN|Hà Nội|Hanoi|ha noi hn
VN|TP. Hồ Chí Minh|Ho Chi Minh City|tp hcm hcm hcmc sai gon saigon ho chi minh tphcm
VN|Hải Phòng|Haiphong|hai phong
VN|Đà Nẵng|Da Nang|da nang
VN|Cần Thơ|Can Tho|can tho
VN|An Giang|Long Xuyen
VN|Bà Rịa - Vũng Tàu|Ba Ria|brvt ba ria vung tau
VN|Bắc Giang|Bac Giang
VN|Bắc Kạn|Bac Kan|bac can
VN|Bạc Liêu|Bac Lieu
VN|Bắc Ninh|Bac Ninh
VN|Bến Tre|Ben Tre
VN|Bình Định|Quy Nhon|binh dinh
VN|Bình Dương|Thu Dau Mot|thu dau mot
VN|Bình Phước|Dong Xoai|dong xoai
VN|Bình Thuận|Phan Thiet|phan thiet mui ne
VN|Cà Mau|Ca Mau
VN|Cao Bằng|Cao Bang
VN|Đắk Lắk|Buon Ma Thuot|dak lak daklak
VN|Đắk Nông|Gia Nghia|dak nong daknong gia nghia
VN|Điện Biên|Dien Bien Phu|dien bien
VN|Đồng Nai|Bien Hoa|dong nai
VN|Đồng Tháp|Cao Lanh|dong thap cao lanh
VN|Gia Lai|Pleiku|gia lai pleiku
VN|Hà Giang|Ha Giang
VN|Hà Nam|Phu Ly|ha nam phu ly
VN|Hà Tĩnh|Ha Tinh
VN|Hải Dương|Hai Duong
VN|Hậu Giang|Vi Thanh|hau giang vi thanh
VN|Hòa Bình|Hoa Binh
VN|Hưng Yên|Hung Yen
VN|Khánh Hòa|Nha Trang|khanh hoa
VN|Kiên Giang|Rach Gia|kien giang rach gia phu quoc
VN|Kon Tum|Kon Tum
VN|Lai Châu|Lai Chau
VN|Lâm Đồng|Da Lat|lam dong
VN|Lạng Sơn|Lang Son
VN|Lào Cai|Lao Cai|sa pa sapa
VN|Long An|Tan An|long an tan an
VN|Nam Định|Nam Dinh
VN|Nghệ An|Vinh|nghe an
VN|Ninh Bình|Ninh Binh
VN|Ninh Thuận|Phan Rang|ninh thuan phan rang
VN|Phú Thọ|Viet Tri|phu tho viet tri
VN|Phú Yên|Tuy Hoa|phu yen tuy hoa
VN|Quảng Bình|Dong Hoi|quang binh dong hoi
VN|Quảng Nam|Tam Ky|quang nam tam ky hoi an
VN|Quảng Ngãi|Quang Ngai
VN|Quảng Ninh|Ha Long|quang ninh
VN|Quảng Trị|Dong Ha|quang tri dong ha
VN|Sóc Trăng|Soc Trang
VN|Sơn La|Son La
VN|Tây Ninh|Tay Ninh
VN|Thái Bình|Thai Binh
VN|Thái Nguyên|Thai Nguyen
VN|Thanh Hóa|Thanh Hoa
VN|Thừa Thiên Huế|Hue|thua thien hue
VN|Tiền Giang|My Tho|tien giang my tho
VN|Trà Vinh|Tra Vinh
VN|Tuyên Quang|Tuyen Quang
VN|Vĩnh Long|Vinh Long
VN|Vĩnh Phúc|Vinh Yen|vinh phuc vinh yen
VN|Yên Bái|Yen Bai
VN|Nha Trang|Nha Trang|khanh hoa
VN|Đà Lạt|Da Lat|lam dong
VN|Vũng Tàu|Vung Tau|ba ria vung tau brvt
VN|Biên Hòa|Bien Hoa|dong nai
VN|Thủ Đức|Thu Duc|tp hcm sai gon
VN|Buôn Ma Thuột|Buon Ma Thuot|dak lak
VN|Quy Nhơn|Quy Nhon|binh dinh
VN|Vinh|Vinh|nghe an
VN|Huế|Hue|thua thien hue
VN|Hội An|Hoi An|quang nam
VN|Phú Quốc|Phu Quoc|kien giang
VN|Long Thành|Long Thanh|dong nai
VN|Dĩ An|Di An|binh duong
VN|Thuận An|Thuan An|binh duong
VN|Sa Pa|Sa Pa|lao cai sapa
KR|Seoul|Seoul|soul han quoc
KR|Busan|Busan|pusan
KR|Incheon|Incheon
KR|Daegu|Daegu|taegu
KR|Daejeon|Daejeon|taejon
KR|Gwangju|Gwangju|kwangju
KR|Ulsan|Ulsan
KR|Sejong|Sejong
KR|Suwon|Suwon
KR|Seongnam|Seongnam
KR|Goyang|Goyang
KR|Yongin|Yongin
KR|Changwon|Changwon
KR|Cheongju|Cheongju
KR|Jeonju|Jeonju
KR|Jeju|Jeju City|jeju do che chu
KR|Seogwipo|Seogwipo|jeju
KR|Pohang|Pohang
KR|Gimhae|Gimhae
KR|Gumi|Gumi
KR|Asan|Asan
KR|Cheonan|Cheonan
KR|Chungju|Chungju
KR|Gangneung|Gangneung
KR|Wonju|Wonju
KR|Chuncheon|Chuncheon
KR|Ansan|Ansan
KR|Bucheon|Bucheon
KR|Anyang|Anyang
KR|Hwaseong|Hwaseong
KR|Pyeongtaek|Pyeongtaek
KR|Siheung|Siheung
KR|Gimpo|Gimpo
KR|Paju|Paju
KR|Uijeongbu|Uijeongbu
KR|Namyangju|Namyangju
KR|Gwangmyeong|Gwangmyeong
KR|Gunpo|Gunpo
KR|Hanam|Hanam
KR|Icheon|Icheon
KR|Osan|Osan
KR|Yangju|Yangju
KR|Jinju|Jinju
KR|Yangsan|Yangsan
KR|Gyeongju|Gyeongju
KR|Andong|Andong
KR|Gyeongsan|Gyeongsan
KR|Mokpo|Mokpo
KR|Yeosu|Yeosu
KR|Suncheon|Suncheon
KR|Gunsan|Gunsan
KR|Iksan|Iksan
KR|Sokcho|Sokcho
KR|Donghae|Donghae
KR|Jecheon|Jecheon
KR|Eumseong|Eumseong
KR|Jincheon|Jincheon
KR|Nonsan|Nonsan
KR|Seosan|Seosan
KR|Dangjin|Dangjin
KR|Tongyeong|Tongyeong
KR|Geoje|Geoje
KR|Miryang|Miryang
KR|Sacheon|Sacheon
KR|Gimcheon|Gimcheon
JP|Tokyo|Tokyo|dong kinh
JP|Osaka|Osaka
JP|Nagoya|Nagoya
JP|Fukuoka|Fukuoka
JP|Sapporo|Sapporo
JP|Kyoto|Kyoto
JP|Yokohama|Yokohama
JP|Kobe|Kobe
JP|Hiroshima|Hiroshima
JP|Sendai|Sendai
JP|Kawasaki|Kawasaki
JP|Saitama|Saitama
JP|Chiba|Chiba
JP|Nara|Nara
JP|Naha (Okinawa)|Naha|okinawa naha
JP|Kitakyushu|Kitakyushu
JP|Niigata|Niigata
JP|Shizuoka|Shizuoka
JP|Hamamatsu|Hamamatsu
JP|Kumamoto|Kumamoto
JP|Kagoshima|Kagoshima
JP|Okayama|Okayama
JP|Matsuyama|Matsuyama
JP|Kanazawa|Kanazawa
JP|Nagasaki|Nagasaki
JP|Utsunomiya|Utsunomiya
JP|Gifu|Gifu
JP|Toyota|Toyota
JP|Sakai|Sakai
JP|Himeji|Himeji
JP|Tsukuba|Tsukuba
TW|Đài Bắc|Taipei|taipei dai bac dai loan
TW|Tân Bắc|New Taipei|new taipei xin bei tan bac
TW|Đào Viên|Taoyuan|taoyuan dao vien
TW|Đài Trung|Taichung|taichung dai trung
TW|Đài Nam|Tainan|tainan dai nam
TW|Cao Hùng|Kaohsiung|kaohsiung cao hung
TW|Tân Trúc|Hsinchu|hsinchu tan truc
TW|Cơ Long|Keelung|keelung co long
TW|Gia Nghĩa|Chiayi|chiayi gia nghia
TW|Chương Hóa|Changhua|changhua chuong hoa
TW|Bình Đông|Pingtung|pingtung binh dong
TW|Hoa Liên|Hualien|hualien hoa lien
TW|Nghi Lan|Yilan|yilan nghi lan
TW|Miêu Lật|Miaoli|miaoli mieu lat
CN|Bắc Kinh|Beijing|beijing bac kinh
CN|Thượng Hải|Shanghai|shanghai thuong hai
CN|Quảng Châu|Guangzhou|guangzhou quang chau
CN|Thâm Quyến|Shenzhen|shenzhen tham quyen
CN|Thành Đô|Chengdu|chengdu thanh do
CN|Hàng Châu|Hangzhou|hangzhou hang chau
CN|Nam Kinh|Nanjing|nanjing nam kinh
CN|Vũ Hán|Wuhan|wuhan vu han
CN|Trùng Khánh|Chongqing|chongqing trung khanh
CN|Tây An|Xi'an|xian tay an
CN|Thiên Tân|Tianjin|tianjin thien tan
CN|Thẩm Dương|Shenyang|shenyang tham duong
CN|Đại Liên|Dalian|dalian dai lien
CN|Thanh Đảo|Qingdao|qingdao thanh dao
CN|Hạ Môn|Xiamen|xiamen ha mon
CN|Tô Châu|Suzhou|suzhou to chau
CN|Trường Sa|Changsha|changsha truong sa
CN|Trịnh Châu|Zhengzhou|zhengzhou trinh chau
CN|Côn Minh|Kunming|kunming con minh
CN|Quế Lâm|Guilin|guilin que lam
CN|Nam Ninh|Nanning|nanning nam ninh
CN|Phúc Châu|Fuzhou|fuzhou phuc chau
CN|Cáp Nhĩ Tân|Harbin|harbin cap nhi tan
CN|Tế Nam|Jinan|jinan te nam
CN|Đông Hoản|Dongguan|dongguan dong hoan
CN|Phật Sơn|Foshan|foshan phat son
CN|Ninh Ba|Ningbo|ningbo ninh ba
HK|Hồng Kông|Hong Kong|hong kong hongkong
MO|Ma Cao|Macau|macau macao ma cao
TH|Bangkok|Bangkok|bang cop
TH|Chiang Mai|Chiang Mai
TH|Phuket|Phuket
TH|Pattaya|Pattaya
TH|Khon Kaen|Khon Kaen
TH|Hat Yai|Hat Yai
MY|Kuala Lumpur|Kuala Lumpur|kl
MY|Johor Bahru|Johor Bahru
MY|Penang (George Town)|George Town|penang
MY|Kota Kinabalu|Kota Kinabalu
MY|Kuching|Kuching
MY|Ipoh|Ipoh
MY|Malacca|Malacca|melaka
MY|Shah Alam|Shah Alam
SG|Singapore|Singapore|sg
ID|Jakarta|Jakarta
ID|Surabaya|Surabaya
ID|Bandung|Bandung
ID|Medan|Medan
ID|Bali (Denpasar)|Denpasar|bali
ID|Yogyakarta|Yogyakarta
ID|Semarang|Semarang
ID|Makassar|Makassar
ID|Batam|Batam
PH|Manila|Manila|ma ni la
PH|Quezon City|Quezon City
PH|Cebu|Cebu City|cebu
PH|Davao|Davao City|davao
PH|Makati|Makati
PH|Baguio|Baguio
PH|Angeles|Angeles City
KH|Phnom Penh|Phnom Penh|nam vang
KH|Siem Reap|Siem Reap|xiem riep
KH|Sihanoukville|Sihanoukville
KH|Battambang|Battambang
LA|Viêng Chăn|Vientiane|vientiane vieng chan
LA|Luang Prabang|Luang Prabang
LA|Savannakhet|Savannakhet
LA|Pakse|Pakse
MM|Yangon|Yangon|rangoon
MM|Naypyidaw|Naypyidaw
MM|Mandalay|Mandalay
IN|New Delhi|New Delhi|delhi
IN|Mumbai|Mumbai|bombay
IN|Bangalore|Bengaluru|bangalore bengaluru
IN|Chennai|Chennai
IN|Kolkata|Kolkata|calcutta
IN|Hyderabad|Hyderabad
IN|Pune|Pune
IN|Ahmedabad|Ahmedabad
IN|Jaipur|Jaipur
AU|Sydney|Sydney|uc australia
AU|Melbourne|Melbourne
AU|Brisbane|Brisbane
AU|Perth|Perth, Western Australia
AU|Adelaide|Adelaide
AU|Canberra|Canberra
AU|Gold Coast|Gold Coast
AU|Hobart|Hobart
AU|Darwin|Darwin
AU|Newcastle|Newcastle, New South Wales
AU|Wollongong|Wollongong
NZ|Auckland|Auckland
NZ|Wellington|Wellington
NZ|Christchurch|Christchurch
NZ|Hamilton|Hamilton, Waikato
NZ|Queenstown|Queenstown
NZ|Dunedin|Dunedin
US|New York|New York City|ny nyc new york state
US|Los Angeles|Los Angeles|la california
US|San Jose|San Jose, California|bay area california
US|San Francisco|San Francisco|sf bay area
US|Seattle|Seattle, Washington|washington state
US|Houston|Houston, Texas|texas
US|Dallas|Dallas, Texas|texas
US|Atlanta|Atlanta, Georgia|georgia
US|Chicago|Chicago|illinois
US|Boston|Boston|massachusetts
US|Washington DC|Washington, District of Columbia|dc washington d.c.
US|Westminster (Orange County)|Westminster, California|little saigon orange county
US|Santa Ana|Santa Ana|orange county
US|Garden Grove|Garden Grove|orange county little saigon
US|Anaheim|Anaheim|orange county
US|Irvine|Irvine, California|orange county
US|San Diego|San Diego
US|Sacramento|Sacramento
US|Oakland|Oakland, California
US|Philadelphia|Philadelphia|pennsylvania
US|Miami|Miami, Florida|florida
US|Denver|Denver|colorado
US|Phoenix|Phoenix, Arizona|arizona
US|Las Vegas|Las Vegas|nevada
US|Austin|Austin, Texas
US|San Antonio|San Antonio, Texas
US|Fort Worth|Fort Worth
US|Orlando|Orlando
US|Tampa|Tampa
US|Detroit|Detroit|michigan
US|Minneapolis|Minneapolis|minnesota
US|Portland (Oregon)|Portland, Oregon|oregon
US|Salt Lake City|Salt Lake City|utah
US|Honolulu|Honolulu|hawaii
US|Anchorage|Anchorage|alaska
US|Birmingham (Alabama)|Birmingham, Alabama|alabama
US|Little Rock|Little Rock|arkansas
US|Bridgeport|Bridgeport, Connecticut|connecticut
US|Wilmington|Wilmington, Delaware|delaware
US|Jacksonville|Jacksonville, Florida|florida
US|Boise|Boise|idaho
US|Indianapolis|Indianapolis|indiana
US|Des Moines|Des Moines|iowa
US|Wichita|Wichita|kansas
US|Louisville|Louisville, Kentucky|kentucky
US|New Orleans|New Orleans|louisiana
US|Portland (Maine)|Portland, Maine|maine
US|Baltimore|Baltimore|maryland
US|Jackson|Jackson, Mississippi|mississippi
US|Kansas City|Kansas City, Missouri|missouri
US|Billings|Billings|montana
US|Omaha|Omaha|nebraska
US|Manchester (New Hampshire)|Manchester, New Hampshire|new hampshire
US|Newark|Newark, New Jersey|new jersey
US|Albuquerque|Albuquerque|new mexico
US|Charlotte|Charlotte, North Carolina|north carolina
US|Fargo|Fargo|north dakota
US|Columbus|Columbus, Ohio|ohio
US|Oklahoma City|Oklahoma City|oklahoma
US|Pittsburgh|Pittsburgh|pennsylvania
US|Providence|Providence|rhode island
US|Charleston (South Carolina)|Charleston, South Carolina|south carolina
US|Sioux Falls|Sioux Falls|south dakota
US|Nashville|Nashville|tennessee
US|Memphis|Memphis|tennessee
US|Burlington (Vermont)|Burlington, Vermont|vermont
US|Virginia Beach|Virginia Beach|virginia
US|Richmond (Virginia)|Richmond, Virginia|virginia
US|Charleston (West Virginia)|Charleston, West Virginia|west virginia
US|Milwaukee|Milwaukee|wisconsin
US|Cheyenne|Cheyenne|wyoming
US|Cleveland|Cleveland
US|Cincinnati|Cincinnati
US|St. Louis|St. Louis
US|Raleigh|Raleigh
US|Fairfax|Fairfax, Virginia
US|Falls Church|Falls Church
US|Arlington (Virginia)|Arlington, Virginia
US|Arlington (Texas)|Arlington, Texas
US|Garland|Garland, Texas
US|Plano|Plano
US|Irving|Irving, Texas
US|Sugar Land|Sugar Land
US|Fresno|Fresno
US|Long Beach|Long Beach, California
US|San Gabriel|San Gabriel
US|Rosemead|Rosemead
US|El Monte|El Monte
US|Fremont|Fremont, California
US|Milpitas|Milpitas
US|Santa Clara|Santa Clara, California
US|Sunnyvale|Sunnyvale
US|Tacoma|Tacoma
US|Bellevue|Bellevue, Washington
US|Lowell|Lowell, Massachusetts
CA|Toronto|Toronto
CA|Vancouver|Vancouver, British Columbia
CA|Montréal|Montreal|montreal
CA|Calgary|Calgary
CA|Ottawa|Ottawa
CA|Edmonton|Edmonton
CA|Winnipeg|Winnipeg
CA|Quebec|Quebec City|quebec
CA|Halifax|Halifax
CA|Mississauga|Mississauga
CA|Hamilton (Ontario)|Hamilton, Ontario
CA|Victoria|Victoria, British Columbia
CA|Saskatoon|Saskatoon
CA|Regina|Regina
CA|London (Ontario)|London, Ontario
CA|Kitchener|Kitchener
CA|Surrey|Surrey, British Columbia
GB|London|London|luan don
GB|Manchester|Manchester
GB|Birmingham|Birmingham, England
GB|Liverpool|Liverpool
GB|Leeds|Leeds
GB|Glasgow|Glasgow
GB|Edinburgh|Edinburgh
GB|Bristol|Bristol
GB|Cardiff|Cardiff
GB|Belfast|Belfast
GB|Sheffield|Sheffield
GB|Newcastle upon Tyne|Newcastle upon Tyne
GB|Nottingham|Nottingham
GB|Oxford|Oxford
GB|Cambridge|Cambridge, England
FR|Paris|Paris|ba le
FR|Marseille|Marseille
FR|Lyon|Lyon
FR|Toulouse|Toulouse
FR|Nice|Nice
FR|Nantes|Nantes
FR|Strasbourg|Strasbourg
FR|Bordeaux|Bordeaux
FR|Lille|Lille
FR|Montpellier|Montpellier
FR|Rennes|Rennes
DE|Berlin|Berlin
DE|München|Munich|munich munchen
DE|Frankfurt|Frankfurt am Main|frankfurt
DE|Hamburg|Hamburg
DE|Köln|Cologne|cologne koln
DE|Düsseldorf|Dusseldorf|dusseldorf
DE|Stuttgart|Stuttgart
DE|Leipzig|Leipzig
DE|Dresden|Dresden
DE|Hannover|Hanover|hannover
DE|Nürnberg|Nuremberg|nuremberg nurnberg
DE|Bremen|Bremen
DE|Dortmund|Dortmund
DE|Essen|Essen
DE|Heidelberg|Heidelberg
DE|Bonn|Bonn
NL|Amsterdam|Amsterdam
NL|Rotterdam|Rotterdam
NL|Den Haag|The Hague|the hague den haag
NL|Utrecht|Utrecht
NL|Eindhoven|Eindhoven
BE|Brussels|Brussels|bruxelles
BE|Antwerp|Antwerp|antwerpen
BE|Ghent|Ghent|gent
CH|Zürich|Zurich|zurich
CH|Geneva|Geneva|geneve
CH|Bern|Bern
CH|Basel|Basel
IT|Roma|Rome|rome
IT|Milano|Milan|milan
IT|Napoli|Naples|naples
IT|Torino|Turin|turin
IT|Firenze|Florence|florence
IT|Venezia|Venice|venice
IT|Bologna|Bologna
ES|Madrid|Madrid
ES|Barcelona|Barcelona
ES|Valencia|Valencia, Valencian Community
ES|Sevilla|Seville|seville
ES|Bilbao|Bilbao
PT|Lisbon|Lisbon|lisboa
PT|Porto|Porto
PL|Warsaw|Warsaw|warszawa
PL|Kraków|Krakow|krakow
PL|Wrocław|Wroclaw|wroclaw
PL|Gdańsk|Gdansk|gdansk
PL|Poznań|Poznan|poznan
CZ|Praha|Prague|prague
CZ|Brno|Brno
RU|Moskva|Moscow|moscow
RU|Sankt-Peterburg|Saint Petersburg|saint petersburg
RU|Vladivostok|Vladivostok
RU|Novosibirsk|Novosibirsk
RU|Kazan|Kazan
NO|Oslo|Oslo
NO|Bergen|Bergen
SE|Stockholm|Stockholm
SE|Göteborg|Gothenburg|gothenburg goteborg
SE|Malmö|Malmo|malmo
FI|Helsinki|Helsinki
FI|Tampere|Tampere
DK|Copenhagen|Copenhagen|kobenhavn
DK|Aarhus|Aarhus
IE|Dublin|Dublin
IE|Cork|Cork
AE|Dubai|Dubai
AE|Abu Dhabi|Abu Dhabi
AE|Sharjah|Sharjah
QA|Doha|Doha
SA|Riyadh|Riyadh
SA|Jeddah|Jeddah
TR|Istanbul|Istanbul
TR|Ankara|Ankara
TR|Izmir|Izmir
IL|Tel Aviv|Tel Aviv
IL|Jerusalem|Jerusalem
ZA|Johannesburg|Johannesburg
ZA|Cape Town|Cape Town
ZA|Durban|Durban
AT|Wien|Vienna|vienna
GR|Athens|Athens|athina
MN|Ulaanbaatar|Ulaanbaatar|ulan bator
BN|Bandar Seri Begawan|Bandar Seri Begawan
`.trim().split('\n').map((l) => l.split('|'));

const norm = (x) => x.toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cacheFile = new URL('./.places-cache.json', import.meta.url);
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};

// Open-Meteo không trả về các nơi này đúng tên tra, nên điền tay.
const MANUAL = {
  'VN|Ninh Binh': { lat: 20.2506, lon: 105.9745, tz: 'Asia/Ho_Chi_Minh' },
  'KR|Seongnam': { lat: 37.42, lon: 127.1267, tz: 'Asia/Seoul' },
  'KR|Yongin': { lat: 37.2411, lon: 127.1776, tz: 'Asia/Seoul' },
  'KR|Ansan': { lat: 37.3219, lon: 126.8309, tz: 'Asia/Seoul' },
  'KR|Anyang': { lat: 37.3943, lon: 126.9568, tz: 'Asia/Seoul' },
  'KR|Hwaseong': { lat: 37.1996, lon: 126.8312, tz: 'Asia/Seoul' },
  'KR|Icheon': { lat: 37.272, lon: 127.435, tz: 'Asia/Seoul' },
  'KR|Gyeongsan': { lat: 35.825, lon: 128.7414, tz: 'Asia/Seoul' },
  'KR|Donghae': { lat: 37.5247, lon: 129.1143, tz: 'Asia/Seoul' },
  'KR|Jincheon': { lat: 36.8553, lon: 127.4353, tz: 'Asia/Seoul' },
  'KR|Dangjin': { lat: 36.8933, lon: 126.6475, tz: 'Asia/Seoul' },
  'KR|Sacheon': { lat: 35.0037, lon: 128.0642, tz: 'Asia/Seoul' },
  'PH|Makati': { lat: 14.5547, lon: 121.0244, tz: 'Asia/Manila' },
  'VN|Quy Nhon': { lat: 13.7765, lon: 109.2237, tz: 'Asia/Ho_Chi_Minh' },
  'CA|Quebec City': { lat: 46.8139, lon: -71.208, tz: 'America/Toronto' },
  'ES|Valencia, Valencian Community': { lat: 39.4699, lon: -0.3763, tz: 'Europe/Madrid' },
};

async function look(cc, q) {
  if (MANUAL[`${cc}|${q}`]) return MANUAL[`${cc}|${q}`];
  const [name, admin] = q.split(',').map((s) => s.trim());
  const key = `${cc}|${q}`;
  if (cache[key]) return cache[key];
  for (let tries = 0; tries < 4; tries++) {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json&countryCode=${cc}`);
    if (res.status === 429) { await sleep(3000); continue; }
    const d = await res.json();
    const ok = (d.results ?? []).filter((r) => r.country_code === cc && (!admin || norm(`${r.admin1 ?? ''} ${r.admin2 ?? ''}`).includes(norm(admin))));
    // Ưu tiên tên khớp đúng, rồi nơi đông dân nhất (tránh trúng làng trùng tên).
    const exact = ok.filter((r) => norm(r.name) === norm(name));
    const best = (exact.length ? exact : ok).sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];
    if (best) cache[key] = { lat: best.latitude, lon: best.longitude, tz: cc === 'VN' ? 'Asia/Ho_Chi_Minh' : best.timezone };
    await sleep(120);
    return cache[key];
  }
}

const out = [], miss = [], byQuery = new Map();
for (const [cc, display, q = display, kw = ''] of RAW) {
  const r = await look(cc, q);
  if (!r) { miss.push(`${cc} ${display} (${q})`); continue; }
  const key = `${cc}|${norm(display)}`;
  const kws = norm(`${q.split(',')[0]} ${kw}`);
  if (byQuery.has(key)) { const e = byQuery.get(key); e[5] = [...new Set(`${e[5]} ${kws}`.trim().split(' '))].join(' '); continue; }
  const e = [display, cc, +r.lat.toFixed(4), +r.lon.toFixed(4), r.tz, kws === norm(display) ? '' : kws];
  byQuery.set(key, e);
  out.push(e);
}
writeFileSync(cacheFile, JSON.stringify(cache));
const tzs = [...new Set(out.map((o) => o[4]))];
const used = [...new Set(out.map((o) => o[1]))];
const json = { c: Object.fromEntries(used.map((c) => [c, COUNTRY[c]])), z: tzs, p: out.map(([n, cc, la, lo, tz, k]) => [n, cc, la, lo, tzs.indexOf(tz), k]) };
writeFileSync(new URL('../src/places.json', import.meta.url), JSON.stringify(json));
console.log(`Ghi ${out.length} địa danh, ${used.length} nước.`);
console.log(miss.length ? `KHÔNG KHỚP (${miss.length}):\n${miss.join('\n')}` : 'Khớp hết.');
