import { toKan, toNumber } from "./ya-kansuji.js";
//#region src/constants.ts
const GREGORIAN_START_JD = 2405160;
const IMPERIAL_START_JD = 1480041;
const IMPERIAL_START_YEAR = -660;
const COMMON_ERA_START_JD = 1721424;
const JD_MAX = Number.MAX_SAFE_INTEGER;
const WESTERN_ERA_NAMES = [
	"",
	"西暦",
	"紀元前"
];
const IMPERIAL_ERA_NAMES = ["皇紀", "神武天皇即位紀元"];
const ALT_MONTH_NAME = [
	"睦月",
	"如月",
	"弥生",
	"卯月",
	"皐月",
	"水無月",
	"文月",
	"葉月",
	"長月",
	"神無月",
	"霜月",
	"師走"
];
const KANJI_VARIANTS = {
	"宝": "寳",
	"霊": "靈",
	"神": "神",
	"応": "應",
	"暦": "曆",
	"祥": "祥",
	"寿": "壽",
	"斎": "斉",
	"観": "觀",
	"寛": "寬",
	"徳": "德",
	"禄": "祿",
	"万": "萬",
	"福": "福",
	"禎": "禎",
	"国": "國",
	"亀": "龜",
	"令": "令"
};
const SQUARE_ERAS = {
	"㍾": "明治",
	"㍽": "大正",
	"㍼": "昭和",
	"㍻": "平成",
	"㋿": "令和"
};
const NUM_CHARS = "零壱壹弌弐貳貮参參弎肆伍陸漆質柒捌玖〇一二三四五六七八九十拾什卄廿卅丗卌百陌佰皕阡仟千万萬億兆京垓0123456789０１２３４５６７８９";
//#endregion
//#region src/errors.ts
/**
* 文字列を和暦日付としてパースできなかったときに投げられる。
* Ruby 版 wareki の `ArgumentError` に相当する。
*/
var WarekiParseError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "WarekiParseError";
	}
};
/**
* 和暦としては認識できたが、日付として成立しない (存在しない月・日、存在しない
* 閏月、改暦で欠落した明治5年12月3日〜31日など) ときに投げられる。
* Ruby 版 wareki の `Wareki::InvalidDate` (`ArgumentError` のサブクラス) に相当する。
*
* {@link WarekiParseError} のサブクラスなので `e instanceof WarekiParseError` でまとめて
* 捕捉できる。{@link parseToDate} だけはこれを個別に見分け、`new Date(str)` への
* フォールバックをせず常に再 throw する。
*/
var WarekiInvalidDateError = class extends WarekiParseError {
	constructor(message) {
		super(message);
		this.name = "WarekiInvalidDateError";
	}
};
/**
* サポート範囲外の日付を変換しようとしたときに投げられる。
* 旧暦445年1月1日より前、元号「大化」開始より前、および元号の空白期間
* (白雉〜朱鳥の間など) が対象。Ruby 版 wareki の `Wareki::UnsupportedDateRange` に相当する。
*/
var UnsupportedDateRangeError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "UnsupportedDateRangeError";
	}
};
//#endregion
//#region src/jd.ts
const fdiv = (a, b) => Math.floor(a / b);
function gregorianToJd(y, m, d) {
	const a = fdiv(14 - m, 12);
	const yy = y + 4800 - a;
	const mm = m + 12 * a - 3;
	return d + fdiv(153 * mm + 2, 5) + 365 * yy + fdiv(yy, 4) - fdiv(yy, 100) + fdiv(yy, 400) - 32045;
}
function jdToGregorian(jd) {
	const a = jd + 32044;
	const b = fdiv(4 * a + 3, 146097);
	const c = a - fdiv(146097 * b, 4);
	const d = fdiv(4 * c + 3, 1461);
	const e = c - fdiv(1461 * d, 4);
	const m = fdiv(5 * e + 2, 153);
	return {
		year: 100 * b + d - 4800 + fdiv(m, 10),
		month: m + 3 - 12 * fdiv(m, 10),
		day: e - fdiv(153 * m + 2, 5) + 1
	};
}
function julianToJd(y, m, d) {
	const a = fdiv(14 - m, 12);
	const yy = y + 4800 - a;
	const mm = m + 12 * a - 3;
	return d + fdiv(153 * mm + 2, 5) + 365 * yy + fdiv(yy, 4) - 32083;
}
function jdToJulian(jd) {
	const c = jd + 32082;
	const d = fdiv(4 * c + 3, 1461);
	const e = c - fdiv(1461 * d, 4);
	const m = fdiv(5 * e + 2, 153);
	return {
		year: d - 4800 + fdiv(m, 10),
		month: m + 3 - 12 * fdiv(m, 10),
		day: e - fdiv(153 * m + 2, 5) + 1
	};
}
function italyToJd(y, m, d) {
	if (y > 1582 || y === 1582 && (m > 10 || m === 10 && d >= 15)) return gregorianToJd(y, m, d);
	if (y < 1582 || m < 10 || d <= 4) return julianToJd(y, m, d);
	throw new WarekiParseError(`invalid date (nonexistent in Julian-Gregorian transition): ${y}-${m}-${d}`);
}
//#endregion
//#region src/data/era-defs.ts
const ERA_TUPLES = [
	[
		"大化",
		645,
		1956842,
		1958551
	],
	[
		"白雉",
		650,
		1958551,
		1960339
	],
	[
		"朱鳥",
		686,
		1971845,
		1972033
	],
	[
		"大宝",
		701,
		1977221,
		1978361
	],
	[
		"慶雲",
		704,
		1978361,
		1979692
	],
	[
		"和銅",
		708,
		1979692,
		1982487
	],
	[
		"霊亀",
		715,
		1982487,
		1983300
	],
	[
		"養老",
		717,
		1983300,
		1985561
	],
	[
		"神亀",
		724,
		1985561,
		1987570
	],
	[
		"天平",
		729,
		1987570,
		1994754
	],
	[
		"天平感宝",
		749,
		1994754,
		1994861
	],
	[
		"天平勝宝",
		749,
		1994861,
		1997801
	],
	[
		"天平宝字",
		757,
		1997801,
		2000506
	],
	[
		"天平神護",
		765,
		2000506,
		2001460
	],
	[
		"神護景雲",
		767,
		2001460,
		2002596
	],
	[
		"宝亀",
		770,
		2002596,
		2006348
	],
	[
		"天応",
		781,
		2006348,
		2006956
	],
	[
		"延暦",
		782,
		2006956,
		2015608
	],
	[
		"大同",
		806,
		2015608,
		2017203
	],
	[
		"弘仁",
		810,
		2017203,
		2022062
	],
	[
		"天長",
		824,
		2022062,
		2025721
	],
	[
		"承和",
		834,
		2025721,
		2030987
	],
	[
		"嘉祥",
		848,
		2030987,
		2032037
	],
	[
		"仁寿",
		851,
		2032037,
		2033338
	],
	[
		"斉衡",
		854,
		2033338,
		2034156
	],
	[
		"天安",
		857,
		2034156,
		2034947
	],
	[
		"貞観",
		859,
		2034947,
		2041534
	],
	[
		"元慶",
		877,
		2041534,
		2044374
	],
	[
		"仁和",
		885,
		2044374,
		2045915
	],
	[
		"寛平",
		889,
		2045915,
		2049192
	],
	[
		"昌泰",
		898,
		2049192,
		2050391
	],
	[
		"延喜",
		901,
		2050391,
		2058332
	],
	[
		"延長",
		923,
		2058332,
		2061241
	],
	[
		"承平",
		931,
		2061241,
		2063835
	],
	[
		"天慶",
		938,
		2063835,
		2067084
	],
	[
		"天暦",
		947,
		2067084,
		2070927
	],
	[
		"天徳",
		957,
		2070927,
		2072127
	],
	[
		"応和",
		961,
		2072127,
		2073390
	],
	[
		"康保",
		964,
		2073390,
		2074871
	],
	[
		"安和",
		968,
		2074871,
		2075473
	],
	[
		"天禄",
		970,
		2075473,
		2076827
	],
	[
		"天延",
		973,
		2076827,
		2077765
	],
	[
		"貞元",
		976,
		2077765,
		2078637
	],
	[
		"天元",
		978,
		2078637,
		2080247
	],
	[
		"永観",
		983,
		2080247,
		2080968
	],
	[
		"寛和",
		985,
		2080968,
		2081684
	],
	[
		"永延",
		987,
		2081684,
		2082543
	],
	[
		"永祚",
		989,
		2082543,
		2082985
	],
	[
		"正暦",
		990,
		2082985,
		2084565
	],
	[
		"長徳",
		995,
		2084565,
		2085974
	],
	[
		"長保",
		999,
		2085974,
		2087989
	],
	[
		"寛弘",
		1004,
		2087989,
		2091095
	],
	[
		"長和",
		1012,
		2091095,
		2092658
	],
	[
		"寛仁",
		1017,
		2092658,
		2094054
	],
	[
		"治安",
		1021,
		2094054,
		2095305
	],
	[
		"万寿",
		1024,
		2095305,
		2096765
	],
	[
		"長元",
		1028,
		2096765,
		2099951
	],
	[
		"長暦",
		1037,
		2099951,
		2101268
	],
	[
		"長久",
		1040,
		2101268,
		2102729
	],
	[
		"寛徳",
		1044,
		2102729,
		2103251
	],
	[
		"永承",
		1046,
		2103251,
		2105699
	],
	[
		"天喜",
		1053,
		2105699,
		2107754
	],
	[
		"康平",
		1058,
		2107754,
		2110296
	],
	[
		"治暦",
		1065,
		2110296,
		2111636
	],
	[
		"延久",
		1069,
		2111636,
		2113595
	],
	[
		"承保",
		1074,
		2113595,
		2114771
	],
	[
		"承暦",
		1077,
		2114771,
		2115974
	],
	[
		"永保",
		1081,
		2115974,
		2117063
	],
	[
		"応徳",
		1084,
		2117063,
		2118215
	],
	[
		"寛治",
		1087,
		2118215,
		2121029
	],
	[
		"嘉保",
		1094,
		2121029,
		2121740
	],
	[
		"永長",
		1096,
		2121740,
		2122098
	],
	[
		"承徳",
		1097,
		2122098,
		2122725
	],
	[
		"康和",
		1099,
		2122725,
		2124361
	],
	[
		"長治",
		1104,
		2124361,
		2125157
	],
	[
		"嘉承",
		1106,
		2125157,
		2126007
	],
	[
		"天仁",
		1108,
		2126007,
		2126697
	],
	[
		"天永",
		1110,
		2126697,
		2127818
	],
	[
		"永久",
		1113,
		2127818,
		2129522
	],
	[
		"元永",
		1118,
		2129522,
		2130267
	],
	[
		"保安",
		1120,
		2130267,
		2131737
	],
	[
		"天治",
		1124,
		2131737,
		2132375
	],
	[
		"大治",
		1126,
		2132375,
		2134214
	],
	[
		"天承",
		1131,
		2134214,
		2134785
	],
	[
		"長承",
		1132,
		2134785,
		2135777
	],
	[
		"保延",
		1135,
		2135777,
		2138033
	],
	[
		"永治",
		1141,
		2138033,
		2138318
	],
	[
		"康治",
		1142,
		2138318,
		2138991
	],
	[
		"天養",
		1144,
		2138991,
		2139493
	],
	[
		"久安",
		1145,
		2139493,
		2141505
	],
	[
		"仁平",
		1151,
		2141505,
		2142894
	],
	[
		"久寿",
		1154,
		2142894,
		2143425
	],
	[
		"保元",
		1156,
		2143425,
		2144511
	],
	[
		"平治",
		1159,
		2144511,
		2144796
	],
	[
		"永暦",
		1160,
		2144796,
		2145380
	],
	[
		"応保",
		1161,
		2145380,
		2145967
	],
	[
		"長寛",
		1163,
		2145967,
		2146769
	],
	[
		"永万",
		1165,
		2146769,
		2147205
	],
	[
		"仁安",
		1166,
		2147205,
		2148161
	],
	[
		"嘉応",
		1169,
		2148161,
		2148912
	],
	[
		"承安",
		1171,
		2148912,
		2150454
	],
	[
		"安元",
		1175,
		2150454,
		2151198
	],
	[
		"治承",
		1177,
		2151198,
		2152655
	],
	[
		"養和",
		1181,
		2152655,
		2152963
	],
	[
		"寿永",
		1182,
		2152963,
		2153661
	],
	[
		"元暦",
		1184,
		2153661,
		2154131
	],
	[
		"文治",
		1185,
		2154131,
		2155841
	],
	[
		"建久",
		1190,
		2155841,
		2159135
	],
	[
		"正治",
		1199,
		2159135,
		2159801
	],
	[
		"建仁",
		1201,
		2159801,
		2160901
	],
	[
		"元久",
		1204,
		2160901,
		2161705
	],
	[
		"建永",
		1206,
		2161705,
		2162234
	],
	[
		"承元",
		1207,
		2162234,
		2163488
	],
	[
		"建暦",
		1211,
		2163488,
		2164489
	],
	[
		"建保",
		1213,
		2164489,
		2166444
	],
	[
		"承久",
		1219,
		2166444,
		2167538
	],
	[
		"貞応",
		1222,
		2167538,
		2168489
	],
	[
		"元仁",
		1224,
		2168489,
		2168637
	],
	[
		"嘉禄",
		1225,
		2168637,
		2169602
	],
	[
		"安貞",
		1227,
		2169602,
		2170040
	],
	[
		"寛喜",
		1229,
		2170040,
		2171159
	],
	[
		"貞永",
		1232,
		2171159,
		2171556
	],
	[
		"天福",
		1233,
		2171556,
		2172107
	],
	[
		"文暦",
		1234,
		2172107,
		2172446
	],
	[
		"嘉禎",
		1235,
		2172446,
		2173601
	],
	[
		"暦仁",
		1238,
		2173601,
		2173674
	],
	[
		"延応",
		1239,
		2173674,
		2174185
	],
	[
		"仁治",
		1240,
		2174185,
		2175140
	],
	[
		"寛元",
		1243,
		2175140,
		2176619
	],
	[
		"宝治",
		1247,
		2176619,
		2177377
	],
	[
		"建長",
		1249,
		2177377,
		2180109
	],
	[
		"康元",
		1256,
		2180109,
		2180267
	],
	[
		"正嘉",
		1257,
		2180267,
		2181017
	],
	[
		"正元",
		1259,
		2181017,
		2181417
	],
	[
		"文応",
		1260,
		2181417,
		2181719
	],
	[
		"弘長",
		1261,
		2181719,
		2182820
	],
	[
		"文永",
		1264,
		2182820,
		2186893
	],
	[
		"建治",
		1275,
		2186893,
		2187929
	],
	[
		"弘安",
		1278,
		2187929,
		2191649
	],
	[
		"正応",
		1288,
		2191649,
		2193575
	],
	[
		"永仁",
		1293,
		2193575,
		2195662
	],
	[
		"正安",
		1299,
		2195662,
		2196957
	],
	[
		"乾元",
		1302,
		2196957,
		2197237
	],
	[
		"嘉元",
		1303,
		2197237,
		2198457
	],
	[
		"徳治",
		1306,
		2198457,
		2199131
	],
	[
		"延慶",
		1308,
		2199131,
		2200037
	],
	[
		"応長",
		1311,
		2200037,
		2200383
	],
	[
		"正和",
		1312,
		2200383,
		2202167
	],
	[
		"文保",
		1317,
		2202167,
		2202960
	],
	[
		"元応",
		1319,
		2202960,
		2203634
	],
	[
		"元亨",
		1321,
		2203634,
		2205008
	],
	[
		"正中",
		1324,
		2205008,
		2205527
	],
	[
		"嘉暦",
		1326,
		2205527,
		2206740
	],
	[
		"元徳",
		1329,
		2206740,
		2207459
	],
	[
		"元弘",
		1331,
		2207459,
		2208365
	],
	[
		"正慶",
		1332,
		2207714,
		2208124
	],
	[
		"建武",
		1334,
		2208365,
		2209133
	],
	[
		"延元",
		1336,
		2209133,
		2210638
	],
	[
		"興国",
		1340,
		2210638,
		2213069
	],
	[
		"正平",
		1346,
		2213069,
		2221512
	],
	[
		"建徳",
		1370,
		2221512,
		2222332
	],
	[
		"文中",
		1372,
		2222332,
		2223453
	],
	[
		"天授",
		1375,
		2223453,
		2225533
	],
	[
		"弘和",
		1381,
		2225533,
		2226702
	],
	[
		"元中",
		1384,
		2226702,
		2229809
	],
	[
		"暦応",
		1338,
		2210046,
		2211375
	],
	[
		"康永",
		1342,
		2211375,
		2212638
	],
	[
		"貞和",
		1345,
		2212638,
		2214239
	],
	[
		"観応",
		1350,
		2214239,
		2215184
	],
	[
		"文和",
		1352,
		2215184,
		2216456
	],
	[
		"延文",
		1356,
		2216456,
		2218287
	],
	[
		"康安",
		1361,
		2218287,
		2218812
	],
	[
		"貞治",
		1362,
		2218812,
		2220786
	],
	[
		"応安",
		1368,
		2220786,
		2223364
	],
	[
		"永和",
		1375,
		2223364,
		2224836
	],
	[
		"康暦",
		1379,
		2224836,
		2225547
	],
	[
		"永徳",
		1381,
		2225547,
		2226642
	],
	[
		"至徳",
		1384,
		2226642,
		2227937
	],
	[
		"嘉慶",
		1387,
		2227937,
		2228456
	],
	[
		"康応",
		1389,
		2228456,
		2228857
	],
	[
		"明徳",
		1390,
		2228857,
		2230430
	],
	[
		"応永",
		1394,
		2230430,
		2242796
	],
	[
		"正長",
		1428,
		2242796,
		2243276
	],
	[
		"永享",
		1429,
		2243276,
		2247452
	],
	[
		"嘉吉",
		1441,
		2247452,
		2248532
	],
	[
		"文安",
		1444,
		2248532,
		2250533
	],
	[
		"宝徳",
		1449,
		2250533,
		2251623
	],
	[
		"享徳",
		1452,
		2251623,
		2252745
	],
	[
		"康正",
		1455,
		2252745,
		2253516
	],
	[
		"長禄",
		1457,
		2253516,
		2254720
	],
	[
		"寛正",
		1460,
		2254720,
		2256587
	],
	[
		"文正",
		1466,
		2256587,
		2256978
	],
	[
		"応仁",
		1467,
		2256978,
		2257769
	],
	[
		"文明",
		1469,
		2257769,
		2264405
	],
	[
		"長享",
		1487,
		2264405,
		2265174
	],
	[
		"延徳",
		1489,
		2265174,
		2266235
	],
	[
		"明応",
		1492,
		2266235,
		2269375
	],
	[
		"文亀",
		1501,
		2269375,
		2270469
	],
	[
		"永正",
		1504,
		2270469,
		2276869
	],
	[
		"大永",
		1521,
		2276869,
		2279406
	],
	[
		"享禄",
		1528,
		2279406,
		2280862
	],
	[
		"天文",
		1532,
		2280862,
		2289332
	],
	[
		"弘治",
		1555,
		2289332,
		2290194
	],
	[
		"永禄",
		1558,
		2290194,
		2294647
	],
	[
		"元亀",
		1570,
		2294647,
		2295833
	],
	[
		"天正",
		1573,
		2295833,
		2302901
	],
	[
		"文禄",
		1592,
		2302901,
		2304337
	],
	[
		"慶長",
		1596,
		2304337,
		2311174
	],
	[
		"元和",
		1615,
		2311174,
		2314321
	],
	[
		"寛永",
		1624,
		2314321,
		2321897
	],
	[
		"正保",
		1644,
		2321897,
		2323077
	],
	[
		"慶安",
		1648,
		2323077,
		2324734
	],
	[
		"承応",
		1652,
		2324734,
		2325674
	],
	[
		"明暦",
		1655,
		2325674,
		2326865
	],
	[
		"万治",
		1658,
		2326865,
		2327871
	],
	[
		"寛文",
		1661,
		2327871,
		2332414
	],
	[
		"延宝",
		1673,
		2332414,
		2335346
	],
	[
		"天和",
		1681,
		2335346,
		2336224
	],
	[
		"貞享",
		1684,
		2336224,
		2337886
	],
	[
		"元禄",
		1688,
		2337886,
		2343539
	],
	[
		"宝永",
		1704,
		2343539,
		2346151
	],
	[
		"正徳",
		1711,
		2346151,
		2348037
	],
	[
		"享保",
		1716,
		2348037,
		2355279
	],
	[
		"元文",
		1736,
		2355279,
		2357049
	],
	[
		"寛保",
		1741,
		2357049,
		2358136
	],
	[
		"延享",
		1744,
		2358136,
		2359721
	],
	[
		"寛延",
		1748,
		2359721,
		2360947
	],
	[
		"宝暦",
		1751,
		2360947,
		2365529
	],
	[
		"明和",
		1764,
		2365529,
		2368614
	],
	[
		"安永",
		1772,
		2368614,
		2371672
	],
	[
		"天明",
		1781,
		2371672,
		2374529
	],
	[
		"寛政",
		1789,
		2374529,
		2378939
	],
	[
		"享和",
		1801,
		2378939,
		2380038
	],
	[
		"文化",
		1804,
		2380038,
		2385216
	],
	[
		"文政",
		1818,
		2385216,
		2389841
	],
	[
		"天保",
		1830,
		2389841,
		2394941
	],
	[
		"弘化",
		1844,
		2394941,
		2396119
	],
	[
		"嘉永",
		1848,
		2396119,
		2398599
	],
	[
		"安政",
		1854,
		2398599,
		2400509
	],
	[
		"万延",
		1860,
		2400509,
		2400864
	],
	[
		"文久",
		1861,
		2400864,
		2401958
	],
	[
		"元治",
		1864,
		2401958,
		2402358
	],
	[
		"慶応",
		1865,
		2402358,
		2403629
	],
	[
		"明治",
		1868,
		2403357,
		2419613
	],
	[
		"大正",
		1912,
		2419614,
		2424874
	],
	[
		"昭和",
		1926,
		2424875,
		2447534
	],
	[
		"平成",
		1989,
		2447535,
		2458604
	],
	[
		"令和",
		2019,
		2458605,
		9007199254740991
	]
];
const ERA_NORTH_TUPLES = [
	[
		"大化",
		645,
		1956842,
		1958551
	],
	[
		"白雉",
		650,
		1958551,
		1960339
	],
	[
		"朱鳥",
		686,
		1971845,
		1972033
	],
	[
		"大宝",
		701,
		1977221,
		1978361
	],
	[
		"慶雲",
		704,
		1978361,
		1979692
	],
	[
		"和銅",
		708,
		1979692,
		1982487
	],
	[
		"霊亀",
		715,
		1982487,
		1983300
	],
	[
		"養老",
		717,
		1983300,
		1985561
	],
	[
		"神亀",
		724,
		1985561,
		1987570
	],
	[
		"天平",
		729,
		1987570,
		1994754
	],
	[
		"天平感宝",
		749,
		1994754,
		1994861
	],
	[
		"天平勝宝",
		749,
		1994861,
		1997801
	],
	[
		"天平宝字",
		757,
		1997801,
		2000506
	],
	[
		"天平神護",
		765,
		2000506,
		2001460
	],
	[
		"神護景雲",
		767,
		2001460,
		2002596
	],
	[
		"宝亀",
		770,
		2002596,
		2006348
	],
	[
		"天応",
		781,
		2006348,
		2006956
	],
	[
		"延暦",
		782,
		2006956,
		2015608
	],
	[
		"大同",
		806,
		2015608,
		2017203
	],
	[
		"弘仁",
		810,
		2017203,
		2022062
	],
	[
		"天長",
		824,
		2022062,
		2025721
	],
	[
		"承和",
		834,
		2025721,
		2030987
	],
	[
		"嘉祥",
		848,
		2030987,
		2032037
	],
	[
		"仁寿",
		851,
		2032037,
		2033338
	],
	[
		"斉衡",
		854,
		2033338,
		2034156
	],
	[
		"天安",
		857,
		2034156,
		2034947
	],
	[
		"貞観",
		859,
		2034947,
		2041534
	],
	[
		"元慶",
		877,
		2041534,
		2044374
	],
	[
		"仁和",
		885,
		2044374,
		2045915
	],
	[
		"寛平",
		889,
		2045915,
		2049192
	],
	[
		"昌泰",
		898,
		2049192,
		2050391
	],
	[
		"延喜",
		901,
		2050391,
		2058332
	],
	[
		"延長",
		923,
		2058332,
		2061241
	],
	[
		"承平",
		931,
		2061241,
		2063835
	],
	[
		"天慶",
		938,
		2063835,
		2067084
	],
	[
		"天暦",
		947,
		2067084,
		2070927
	],
	[
		"天徳",
		957,
		2070927,
		2072127
	],
	[
		"応和",
		961,
		2072127,
		2073390
	],
	[
		"康保",
		964,
		2073390,
		2074871
	],
	[
		"安和",
		968,
		2074871,
		2075473
	],
	[
		"天禄",
		970,
		2075473,
		2076827
	],
	[
		"天延",
		973,
		2076827,
		2077765
	],
	[
		"貞元",
		976,
		2077765,
		2078637
	],
	[
		"天元",
		978,
		2078637,
		2080247
	],
	[
		"永観",
		983,
		2080247,
		2080968
	],
	[
		"寛和",
		985,
		2080968,
		2081684
	],
	[
		"永延",
		987,
		2081684,
		2082543
	],
	[
		"永祚",
		989,
		2082543,
		2082985
	],
	[
		"正暦",
		990,
		2082985,
		2084565
	],
	[
		"長徳",
		995,
		2084565,
		2085974
	],
	[
		"長保",
		999,
		2085974,
		2087989
	],
	[
		"寛弘",
		1004,
		2087989,
		2091095
	],
	[
		"長和",
		1012,
		2091095,
		2092658
	],
	[
		"寛仁",
		1017,
		2092658,
		2094054
	],
	[
		"治安",
		1021,
		2094054,
		2095305
	],
	[
		"万寿",
		1024,
		2095305,
		2096765
	],
	[
		"長元",
		1028,
		2096765,
		2099951
	],
	[
		"長暦",
		1037,
		2099951,
		2101268
	],
	[
		"長久",
		1040,
		2101268,
		2102729
	],
	[
		"寛徳",
		1044,
		2102729,
		2103251
	],
	[
		"永承",
		1046,
		2103251,
		2105699
	],
	[
		"天喜",
		1053,
		2105699,
		2107754
	],
	[
		"康平",
		1058,
		2107754,
		2110296
	],
	[
		"治暦",
		1065,
		2110296,
		2111636
	],
	[
		"延久",
		1069,
		2111636,
		2113595
	],
	[
		"承保",
		1074,
		2113595,
		2114771
	],
	[
		"承暦",
		1077,
		2114771,
		2115974
	],
	[
		"永保",
		1081,
		2115974,
		2117063
	],
	[
		"応徳",
		1084,
		2117063,
		2118215
	],
	[
		"寛治",
		1087,
		2118215,
		2121029
	],
	[
		"嘉保",
		1094,
		2121029,
		2121740
	],
	[
		"永長",
		1096,
		2121740,
		2122098
	],
	[
		"承徳",
		1097,
		2122098,
		2122725
	],
	[
		"康和",
		1099,
		2122725,
		2124361
	],
	[
		"長治",
		1104,
		2124361,
		2125157
	],
	[
		"嘉承",
		1106,
		2125157,
		2126007
	],
	[
		"天仁",
		1108,
		2126007,
		2126697
	],
	[
		"天永",
		1110,
		2126697,
		2127818
	],
	[
		"永久",
		1113,
		2127818,
		2129522
	],
	[
		"元永",
		1118,
		2129522,
		2130267
	],
	[
		"保安",
		1120,
		2130267,
		2131737
	],
	[
		"天治",
		1124,
		2131737,
		2132375
	],
	[
		"大治",
		1126,
		2132375,
		2134214
	],
	[
		"天承",
		1131,
		2134214,
		2134785
	],
	[
		"長承",
		1132,
		2134785,
		2135777
	],
	[
		"保延",
		1135,
		2135777,
		2138033
	],
	[
		"永治",
		1141,
		2138033,
		2138318
	],
	[
		"康治",
		1142,
		2138318,
		2138991
	],
	[
		"天養",
		1144,
		2138991,
		2139493
	],
	[
		"久安",
		1145,
		2139493,
		2141505
	],
	[
		"仁平",
		1151,
		2141505,
		2142894
	],
	[
		"久寿",
		1154,
		2142894,
		2143425
	],
	[
		"保元",
		1156,
		2143425,
		2144511
	],
	[
		"平治",
		1159,
		2144511,
		2144796
	],
	[
		"永暦",
		1160,
		2144796,
		2145380
	],
	[
		"応保",
		1161,
		2145380,
		2145967
	],
	[
		"長寛",
		1163,
		2145967,
		2146769
	],
	[
		"永万",
		1165,
		2146769,
		2147205
	],
	[
		"仁安",
		1166,
		2147205,
		2148161
	],
	[
		"嘉応",
		1169,
		2148161,
		2148912
	],
	[
		"承安",
		1171,
		2148912,
		2150454
	],
	[
		"安元",
		1175,
		2150454,
		2151198
	],
	[
		"治承",
		1177,
		2151198,
		2152655
	],
	[
		"養和",
		1181,
		2152655,
		2152963
	],
	[
		"寿永",
		1182,
		2152963,
		2153661
	],
	[
		"元暦",
		1184,
		2153661,
		2154131
	],
	[
		"文治",
		1185,
		2154131,
		2155841
	],
	[
		"建久",
		1190,
		2155841,
		2159135
	],
	[
		"正治",
		1199,
		2159135,
		2159801
	],
	[
		"建仁",
		1201,
		2159801,
		2160901
	],
	[
		"元久",
		1204,
		2160901,
		2161705
	],
	[
		"建永",
		1206,
		2161705,
		2162234
	],
	[
		"承元",
		1207,
		2162234,
		2163488
	],
	[
		"建暦",
		1211,
		2163488,
		2164489
	],
	[
		"建保",
		1213,
		2164489,
		2166444
	],
	[
		"承久",
		1219,
		2166444,
		2167538
	],
	[
		"貞応",
		1222,
		2167538,
		2168489
	],
	[
		"元仁",
		1224,
		2168489,
		2168637
	],
	[
		"嘉禄",
		1225,
		2168637,
		2169602
	],
	[
		"安貞",
		1227,
		2169602,
		2170040
	],
	[
		"寛喜",
		1229,
		2170040,
		2171159
	],
	[
		"貞永",
		1232,
		2171159,
		2171556
	],
	[
		"天福",
		1233,
		2171556,
		2172107
	],
	[
		"文暦",
		1234,
		2172107,
		2172446
	],
	[
		"嘉禎",
		1235,
		2172446,
		2173601
	],
	[
		"暦仁",
		1238,
		2173601,
		2173674
	],
	[
		"延応",
		1239,
		2173674,
		2174185
	],
	[
		"仁治",
		1240,
		2174185,
		2175140
	],
	[
		"寛元",
		1243,
		2175140,
		2176619
	],
	[
		"宝治",
		1247,
		2176619,
		2177377
	],
	[
		"建長",
		1249,
		2177377,
		2180109
	],
	[
		"康元",
		1256,
		2180109,
		2180267
	],
	[
		"正嘉",
		1257,
		2180267,
		2181017
	],
	[
		"正元",
		1259,
		2181017,
		2181417
	],
	[
		"文応",
		1260,
		2181417,
		2181719
	],
	[
		"弘長",
		1261,
		2181719,
		2182820
	],
	[
		"文永",
		1264,
		2182820,
		2186893
	],
	[
		"建治",
		1275,
		2186893,
		2187929
	],
	[
		"弘安",
		1278,
		2187929,
		2191649
	],
	[
		"正応",
		1288,
		2191649,
		2193575
	],
	[
		"永仁",
		1293,
		2193575,
		2195662
	],
	[
		"正安",
		1299,
		2195662,
		2196957
	],
	[
		"乾元",
		1302,
		2196957,
		2197237
	],
	[
		"嘉元",
		1303,
		2197237,
		2198457
	],
	[
		"徳治",
		1306,
		2198457,
		2199131
	],
	[
		"延慶",
		1308,
		2199131,
		2200037
	],
	[
		"応長",
		1311,
		2200037,
		2200383
	],
	[
		"正和",
		1312,
		2200383,
		2202167
	],
	[
		"文保",
		1317,
		2202167,
		2202960
	],
	[
		"元応",
		1319,
		2202960,
		2203634
	],
	[
		"元亨",
		1321,
		2203634,
		2205008
	],
	[
		"正中",
		1324,
		2205008,
		2205527
	],
	[
		"嘉暦",
		1326,
		2205527,
		2206740
	],
	[
		"元徳",
		1329,
		2206740,
		2207714
	],
	[
		"元弘",
		1331,
		2207459,
		2208365
	],
	[
		"正慶",
		1332,
		2207714,
		2208124
	],
	[
		"建武",
		1334,
		2208365,
		2210046
	],
	[
		"延元",
		1336,
		2209133,
		2210638
	],
	[
		"興国",
		1340,
		2210638,
		2213069
	],
	[
		"正平",
		1346,
		2213069,
		2221512
	],
	[
		"建徳",
		1370,
		2221512,
		2222332
	],
	[
		"文中",
		1372,
		2222332,
		2223453
	],
	[
		"天授",
		1375,
		2223453,
		2225533
	],
	[
		"弘和",
		1381,
		2225533,
		2226702
	],
	[
		"元中",
		1384,
		2226702,
		2229809
	],
	[
		"暦応",
		1338,
		2210046,
		2211375
	],
	[
		"康永",
		1342,
		2211375,
		2212638
	],
	[
		"貞和",
		1345,
		2212638,
		2214239
	],
	[
		"観応",
		1350,
		2214239,
		2215184
	],
	[
		"文和",
		1352,
		2215184,
		2216456
	],
	[
		"延文",
		1356,
		2216456,
		2218287
	],
	[
		"康安",
		1361,
		2218287,
		2218812
	],
	[
		"貞治",
		1362,
		2218812,
		2220786
	],
	[
		"応安",
		1368,
		2220786,
		2223364
	],
	[
		"永和",
		1375,
		2223364,
		2224836
	],
	[
		"康暦",
		1379,
		2224836,
		2225547
	],
	[
		"永徳",
		1381,
		2225547,
		2226642
	],
	[
		"至徳",
		1384,
		2226642,
		2227937
	],
	[
		"嘉慶",
		1387,
		2227937,
		2228456
	],
	[
		"康応",
		1389,
		2228456,
		2228857
	],
	[
		"明徳",
		1390,
		2228857,
		2230430
	],
	[
		"応永",
		1394,
		2230430,
		2242796
	],
	[
		"正長",
		1428,
		2242796,
		2243276
	],
	[
		"永享",
		1429,
		2243276,
		2247452
	],
	[
		"嘉吉",
		1441,
		2247452,
		2248532
	],
	[
		"文安",
		1444,
		2248532,
		2250533
	],
	[
		"宝徳",
		1449,
		2250533,
		2251623
	],
	[
		"享徳",
		1452,
		2251623,
		2252745
	],
	[
		"康正",
		1455,
		2252745,
		2253516
	],
	[
		"長禄",
		1457,
		2253516,
		2254720
	],
	[
		"寛正",
		1460,
		2254720,
		2256587
	],
	[
		"文正",
		1466,
		2256587,
		2256978
	],
	[
		"応仁",
		1467,
		2256978,
		2257769
	],
	[
		"文明",
		1469,
		2257769,
		2264405
	],
	[
		"長享",
		1487,
		2264405,
		2265174
	],
	[
		"延徳",
		1489,
		2265174,
		2266235
	],
	[
		"明応",
		1492,
		2266235,
		2269375
	],
	[
		"文亀",
		1501,
		2269375,
		2270469
	],
	[
		"永正",
		1504,
		2270469,
		2276869
	],
	[
		"大永",
		1521,
		2276869,
		2279406
	],
	[
		"享禄",
		1528,
		2279406,
		2280862
	],
	[
		"天文",
		1532,
		2280862,
		2289332
	],
	[
		"弘治",
		1555,
		2289332,
		2290194
	],
	[
		"永禄",
		1558,
		2290194,
		2294647
	],
	[
		"元亀",
		1570,
		2294647,
		2295833
	],
	[
		"天正",
		1573,
		2295833,
		2302901
	],
	[
		"文禄",
		1592,
		2302901,
		2304337
	],
	[
		"慶長",
		1596,
		2304337,
		2311174
	],
	[
		"元和",
		1615,
		2311174,
		2314321
	],
	[
		"寛永",
		1624,
		2314321,
		2321897
	],
	[
		"正保",
		1644,
		2321897,
		2323077
	],
	[
		"慶安",
		1648,
		2323077,
		2324734
	],
	[
		"承応",
		1652,
		2324734,
		2325674
	],
	[
		"明暦",
		1655,
		2325674,
		2326865
	],
	[
		"万治",
		1658,
		2326865,
		2327871
	],
	[
		"寛文",
		1661,
		2327871,
		2332414
	],
	[
		"延宝",
		1673,
		2332414,
		2335346
	],
	[
		"天和",
		1681,
		2335346,
		2336224
	],
	[
		"貞享",
		1684,
		2336224,
		2337886
	],
	[
		"元禄",
		1688,
		2337886,
		2343539
	],
	[
		"宝永",
		1704,
		2343539,
		2346151
	],
	[
		"正徳",
		1711,
		2346151,
		2348037
	],
	[
		"享保",
		1716,
		2348037,
		2355279
	],
	[
		"元文",
		1736,
		2355279,
		2357049
	],
	[
		"寛保",
		1741,
		2357049,
		2358136
	],
	[
		"延享",
		1744,
		2358136,
		2359721
	],
	[
		"寛延",
		1748,
		2359721,
		2360947
	],
	[
		"宝暦",
		1751,
		2360947,
		2365529
	],
	[
		"明和",
		1764,
		2365529,
		2368614
	],
	[
		"安永",
		1772,
		2368614,
		2371672
	],
	[
		"天明",
		1781,
		2371672,
		2374529
	],
	[
		"寛政",
		1789,
		2374529,
		2378939
	],
	[
		"享和",
		1801,
		2378939,
		2380038
	],
	[
		"文化",
		1804,
		2380038,
		2385216
	],
	[
		"文政",
		1818,
		2385216,
		2389841
	],
	[
		"天保",
		1830,
		2389841,
		2394941
	],
	[
		"弘化",
		1844,
		2394941,
		2396119
	],
	[
		"嘉永",
		1848,
		2396119,
		2398599
	],
	[
		"安政",
		1854,
		2398599,
		2400509
	],
	[
		"万延",
		1860,
		2400509,
		2400864
	],
	[
		"文久",
		1861,
		2400864,
		2401958
	],
	[
		"元治",
		1864,
		2401958,
		2402358
	],
	[
		"慶応",
		1865,
		2402358,
		2403629
	],
	[
		"明治",
		1868,
		2403357,
		2419613
	],
	[
		"大正",
		1912,
		2419614,
		2424874
	],
	[
		"昭和",
		1926,
		2424875,
		2447534
	],
	[
		"平成",
		1989,
		2447535,
		2458604
	],
	[
		"令和",
		2019,
		2458605,
		9007199254740991
	]
];
//#endregion
//#region src/era-lookup.ts
const toEra = (t) => ({
	name: t[0],
	year: t[1],
	start: t[2],
	end: t[3]
});
const ERA_DEFS = ERA_TUPLES.map(toEra);
const ERA_NORTH_DEFS = ERA_NORTH_TUPLES.map(toEra);
const ERA_BY_NAME = /* @__PURE__ */ new Map();
for (const e of [...ERA_NORTH_DEFS, ...ERA_DEFS]) ERA_BY_NAME.set(e.name, e);
const IMPERIAL_ERA = {
	name: "皇紀",
	year: IMPERIAL_START_YEAR,
	start: IMPERIAL_START_JD,
	end: JD_MAX
};
ERA_BY_NAME.set("神武天皇即位紀元", IMPERIAL_ERA);
ERA_BY_NAME.set("皇紀", IMPERIAL_ERA);
const COMMON_ERA = {
	name: "西暦",
	year: 1,
	start: COMMON_ERA_START_JD,
	end: JD_MAX
};
ERA_BY_NAME.set("", COMMON_ERA);
ERA_BY_NAME.set("西暦", COMMON_ERA);
const ERA_NAME_KEYS = [...ERA_BY_NAME.keys()];
const VARIANT_TO_CANONICAL = /* @__PURE__ */ new Map();
for (const [canonical, variants] of Object.entries(KANJI_VARIANTS)) for (const v of variants) VARIANT_TO_CANONICAL.set(v, canonical);
function normalizeKanjiVariants(str) {
	return Array.from(str, (c) => VARIANT_TO_CANONICAL.get(c) ?? c).join("");
}
function eraByName(name) {
	return ERA_BY_NAME.get(name) ?? ERA_BY_NAME.get(SQUARE_ERAS[name] ?? normalizeKanjiVariants(name));
}
function findEraByJd(jd) {
	for (let i = ERA_DEFS.length - 1; i >= 0; i--) {
		const e = ERA_DEFS[i];
		if (e.start <= jd && jd <= e.end) return e;
	}
}
//#endregion
//#region src/data/year-defs.ts
const FIRST_JD = 1883618;
const YEAR_COUNT = 1428;
const PACKED = "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";
const START_OVERRIDES = {
	"467": 1891680,
	"486": 1898620,
	"543": 1919439,
	"600": 1940258,
	"657": 1961077,
	"706": 1978973,
	"725": 1985913,
	"744": 1992852,
	"782": 2006731,
	"801": 2013671,
	"820": 2020611,
	"839": 2027551,
	"896": 2048370,
	"934": 2062249,
	"953": 2069189,
	"1048": 2103887,
	"1067": 2110827,
	"1097": 2121783,
	"1116": 2128723,
	"1211": 2163421,
	"1230": 2170361,
	"1268": 2184240,
	"1325": 2205059,
	"1363": 2218939,
	"1382": 2225878,
	"1401": 2232818,
	"1420": 2239757,
	"1439": 2246697,
	"1458": 2253637,
	"1477": 2260577,
	"1534": 2281395,
	"1553": 2288335,
	"1572": 2295275,
	"1583": 2299292,
	"1591": 2302215,
	"1648": 2323034,
	"1689": 2338006,
	"1708": 2344946,
	"1727": 2351885,
	"1784": 2372704,
	"1803": 2379644,
	"1822": 2386584,
	"1841": 2393523
};
const DAY_OVERRIDES = [[
	1872,
	11,
	2
]];
//#endregion
//#region src/year-data.ts
const CODE = new Map(Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-", (c, i) => [c, i]));
const MONTHS_PER_YEAR = 13;
let table;
function decode() {
	const starts = new Int32Array(YEAR_COUNT);
	const ends = new Int32Array(YEAR_COUNT);
	const leapMonths = new Uint8Array(YEAR_COUNT);
	const monthStarts = new Int32Array(YEAR_COUNT * MONTHS_PER_YEAR);
	const monthDays = new Uint8Array(YEAR_COUNT * MONTHS_PER_YEAR);
	const dayOverrides = new Map(DAY_OVERRIDES.map(([y, j, d]) => [y * 16 + j, d]));
	let jd = FIRST_JD;
	for (let i = 0; i < YEAR_COUNT; i++) {
		const year = 445 + i;
		const v = CODE.get(PACKED[3 * i]) * 4096 + CODE.get(PACKED[3 * i + 1]) * 64 + CODE.get(PACKED[3 * i + 2]);
		const leapMonth = v >> 13;
		const count = leapMonth === 0 ? 12 : 13;
		const offset = i * MONTHS_PER_YEAR;
		for (let j = 0; j < count; j++) {
			monthStarts[offset + j] = jd;
			const days = dayOverrides.get(year * 16 + j) ?? (v >> j & 1 ? 30 : 29);
			monthDays[offset + j] = days;
			jd += days;
		}
		starts[i] = START_OVERRIDES[year] ?? monthStarts[offset];
		ends[i] = jd - 1;
		leapMonths[i] = leapMonth;
	}
	return {
		starts,
		ends,
		leapMonths,
		monthStarts,
		monthDays
	};
}
function all() {
	return table ??= decode();
}
function yearDataIndex(year) {
	if (!Number.isInteger(year) || year < 445 || year >= 1873) return void 0;
	return year - 445;
}
function yearLeapMonth(index) {
	const leapMonth = all().leapMonths[index];
	return leapMonth === 0 ? null : leapMonth;
}
function yearMonthCount(index) {
	return yearLeapMonth(index) === null ? 12 : 13;
}
function yearNum(index) {
	return 445 + index;
}
function yearMonthStart(index, monthIndex) {
	return all().monthStarts[index * MONTHS_PER_YEAR + monthIndex];
}
function yearMonthDays(index, monthIndex) {
	const years = all();
	const count = years.leapMonths[index] === 0 ? 12 : 13;
	if (monthIndex < 0 || monthIndex >= count) return void 0;
	return years.monthDays[index * MONTHS_PER_YEAR + monthIndex];
}
function findYearIndexByJd(jd) {
	if (jd < 1883618) return void 0;
	const years = all();
	let hi = YEAR_COUNT - 1;
	if (jd > years.ends[hi]) return void 0;
	let lo = 0;
	while (lo < hi) {
		const mid = lo + hi >> 1;
		if (years.ends[mid] >= jd) hi = mid;
		else lo = mid + 1;
	}
	return lo;
}
//#endregion
//#region src/utils.ts
const MONTH_DAYS = [
	31,
	28,
	31,
	30,
	31,
	30,
	31,
	31,
	30,
	31,
	30,
	31
];
const mod = (a, b) => (a % b + b) % b;
function gregorianLastDay(year, month) {
	if (month === 2) return mod(year, 4) === 0 && (mod(year, 100) !== 0 || mod(year, 400) === 0) ? 29 : 28;
	return MONTH_DAYS[month - 1];
}
function julianLastDay(year, month) {
	if (month === 2) return mod(year, 4) === 0 ? 29 : 28;
	return MONTH_DAYS[month - 1];
}
function lastDayOfMonth(year, month, isLeap) {
	if (year >= 1873) return gregorianLastDay(year, month);
	const yearIndex = yearDataIndex(year);
	if (yearIndex === void 0) throw new UnsupportedDateRangeError(`Cannot find year ${year}`);
	const leapMonth = yearLeapMonth(yearIndex);
	let monthIdx = month - 1;
	if (isLeap || leapMonth !== null && leapMonth < month) monthIdx += 1;
	return yearMonthDays(yearIndex, monthIdx);
}
function eraYearToCivil(eraName, eraYear) {
	const era = eraName ?? "";
	if (era === "" || era === "西暦") return eraYear;
	if (era === "紀元前") return -eraYear;
	if (IMPERIAL_ERA_NAMES.includes(era)) return eraYear + IMPERIAL_START_YEAR;
	const def = eraByName(era);
	if (!def) throw new WarekiParseError(`Undefined era '${era}'`);
	return def.year + eraYear - 1;
}
function lastDayOfEraMonth(eraName, civilYear, month, isLeap) {
	const era = eraName ?? "";
	if (WESTERN_ERA_NAMES.includes(era)) {
		if (civilYear === 1582 && month === 10) return 31;
		if (civilYear > 1582 || civilYear === 1582 && month > 10) return gregorianLastDay(civilYear, month);
		return julianLastDay(civilYear, month);
	}
	return lastDayOfMonth(civilYear, month, isLeap);
}
function altMonthNameToNumber(name) {
	const i = ALT_MONTH_NAME.indexOf(name);
	return i < 0 ? void 0 : i + 1;
}
function altMonthName(month) {
	return ALT_MONTH_NAME[month - 1];
}
function findDateParts(jd) {
	if (jd >= 2405160) return {
		...jdToGregorian(jd),
		isLeapMonth: false
	};
	const yearIndex = findYearIndexByJd(jd);
	if (yearIndex === void 0) throw new UnsupportedDateRangeError(`Unsupported date: jd ${jd}`);
	const count = yearMonthCount(yearIndex);
	let pos = count;
	for (let i = 1; i < count; i++) if (jd <= yearMonthStart(yearIndex, i) - 1) {
		pos = i;
		break;
	}
	const monthStart = yearMonthStart(yearIndex, pos - 1);
	const leapMonth = yearLeapMonth(yearIndex);
	const isLeapMonth = leapMonth !== null && leapMonth === pos - 1;
	if (leapMonth !== null && leapMonth < pos) pos -= 1;
	return {
		year: yearNum(yearIndex),
		month: pos,
		day: jd - monthStart + 1,
		isLeapMonth
	};
}
function i2z(num) {
	return String(num).replace(/[0-9]/g, (c) => "０１２３４５６７８９"[Number(c)]);
}
function k2i(str) {
	const s = str.trim();
	if (s === "正" || s === "元" || s === "朔") return 1;
	return toNumber(s);
}
//#endregion
//#region src/format.ts
const DATE_KEY_PART = "[fFyYegGoOiImMsSlLdD][kK]?";
const directiveSource = (keyPart) => `(?<!%)((?:%%)*)%J(-|[_0]{0,2}[0-9]*|)(${keyPart})`;
const directiveRegexCache = /* @__PURE__ */ new Map();
function expandJDirectives(fmt, keyPart, resolve) {
	if (!fmt.includes("%J")) return fmt;
	let re = directiveRegexCache.get(keyPart);
	if (!re) {
		re = new RegExp(directiveSource(keyPart), "g");
		directiveRegexCache.set(keyPart, re);
	}
	return fmt.replace(re, (_whole, esc, opt, key) => {
		const out = resolve(key, opt);
		return out === void 0 ? `${esc}%J${opt}${key}` : `${esc}${out}`;
	});
}
const DATE_DIRECTIVE_REGEX = new RegExp(directiveSource(DATE_KEY_PART));
function hasJDateDirective(fmt) {
	return DATE_DIRECTIVE_REGEX.test(fmt);
}
function fmtNum(n, opt) {
	let spec;
	if (opt === "" || opt === "0" || opt === "_0") spec = "02";
	else if (opt === "-") spec = "";
	else if (/_$/.test(opt)) spec = "2";
	else if (/0?_/.test(opt)) spec = opt.replace(/0?_/, "");
	else if (/_?0/.test(opt)) spec = opt.replace(/_?0/, "0");
	else spec = `0${opt}`;
	if (spec === "") return String(n);
	const pad = spec.startsWith("0") ? "0" : " ";
	return String(n).padStart(Number.parseInt(spec, 10), pad);
}
function formatKey(d, key, opt) {
	switch (key) {
		case "e": return d.eraName;
		case "g": return d.eraName === "" ? "" : fmtNum(d.eraYear, opt);
		case "G": return d.eraName === "" ? "" : i2z(d.eraYear);
		case "Gk": return d.eraName === "" ? "" : toKan(d.eraYear, "simple");
		case "GK":
			if (d.eraName === "") return "";
			return d.eraYear === 1 ? "元" : toKan(d.eraYear, "simple");
		case "o": return String(d.year);
		case "O": return i2z(d.year);
		case "Ok": return toKan(d.year, "simple");
		case "i": return String(d.imperialYear);
		case "I": return i2z(d.imperialYear);
		case "Ik": return toKan(d.imperialYear, "simple");
		case "s": return fmtNum(d.month, opt);
		case "S": return i2z(d.month);
		case "Sk": return toKan(d.month, "simple");
		case "SK": return altMonthName(d.month);
		case "l": return d.isLeapMonth ? "'" : "";
		case "L": return d.isLeapMonth ? "’" : "";
		case "Lk": return d.isLeapMonth ? "閏" : "";
		case "d": return fmtNum(d.day, opt);
		case "D": return i2z(d.day);
		case "Dk": return toKan(d.day, "simple");
		case "DK":
			if (d.month === 1 && !d.isLeapMonth && d.day === 1) return "元";
			if (d.day === 1) return "朔";
			if (d.day === d.lastDayOfMonth) return "晦";
			return toKan(d.day, "simple");
		case "m": return `${formatKey(d, "s", opt)}${formatKey(d, "l", "")}`;
		case "M": return `${formatKey(d, "Lk", "")}${formatKey(d, "S", "")}`;
		case "Mk": return `${formatKey(d, "Lk", "")}${formatKey(d, "Sk", "")}`;
		case "y": return `${formatKey(d, "e", "")}${formatKey(d, "g", opt)}`;
		case "Y": return `${formatKey(d, "e", "")}${formatKey(d, "G", "")}`;
		case "Yk": return `${formatKey(d, "e", "")}${formatKey(d, "Gk", "")}`;
		case "YK": return `${formatKey(d, "e", "")}${formatKey(d, "GK", "")}`;
		case "f": return `${formatKey(d, "e", "")}${formatKey(d, "g", opt)}年${formatKey(d, "s", opt)}${formatKey(d, "l", "")}月${formatKey(d, "d", opt)}日`;
		case "F": return `${formatKey(d, "e", "")}${formatKey(d, "GK", "")}年${formatKey(d, "Lk", "")}${formatKey(d, "Sk", "")}月${formatKey(d, "Dk", "")}日`;
		default: return;
	}
}
const pad0 = (n, w) => String(n).padStart(w, "0");
function stdStrftimeCore(year, month, day, dayOfYear, str) {
	const year4 = year < 0 ? `-${pad0(-year, 4)}` : pad0(year, 4);
	return str.replace(/%([YymdejF%])/g, (whole, code) => {
		switch (code) {
			case "Y": return year4;
			case "y": return pad0((year % 100 + 100) % 100, 2);
			case "m": return pad0(month, 2);
			case "d": return pad0(day, 2);
			case "e": return String(day).padStart(2, " ");
			case "j": return pad0(dayOfYear, 3);
			case "F": return `${year4}-${pad0(month, 2)}-${pad0(day, 2)}`;
			case "%": return "%";
			default: return whole;
		}
	});
}
function stdStrftime(d, str) {
	const jd = d.jd;
	const parts = jd >= 2299161 ? jdToGregorian(jd) : jdToJulian(jd);
	const dayOfYear = jd - italyToJd(parts.year, 1, 1) + 1;
	return stdStrftimeCore(parts.year, parts.month, parts.day, dayOfYear, str);
}
function stdStrftimeFromParts(year, month, day, str) {
	return stdStrftimeCore(year, month, day, gregorianToJd(year, month, day) - gregorianToJd(year, 1, 1) + 1, str);
}
function stdStrftimeFromDate(date, str) {
	return stdStrftimeFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate(), str);
}
function formatWareki(d, fmt) {
	const expanded = expandJDirectives(fmt, DATE_KEY_PART, (key, opt) => formatKey(d, key, opt));
	if (!expanded.includes("%")) return expanded;
	return stdStrftime(d, expanded);
}
//#endregion
//#region src/temporal.ts
function isTemporalDateLike(x) {
	if (typeof x !== "object" || x === null) return false;
	const t = x;
	return typeof t["calendarId"] === "string" && typeof t["year"] === "number" && typeof t["month"] === "number" && typeof t["day"] === "number" && typeof t["withCalendar"] === "function";
}
function temporalToIsoParts(t) {
	const { year, month, day } = t.calendarId === "iso8601" ? t : t.withCalendar("iso8601");
	if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month) || !Number.isSafeInteger(day)) throw new TypeError(`invalid Temporal object: non-integer ISO date fields (${year}-${month}-${day})`);
	const rt = jdToGregorian(gregorianToJd(year, month, day));
	if (rt.year !== year || rt.month !== month || rt.day !== day) throw new TypeError(`invalid Temporal object: no such ISO date (${year}-${month}-${day})`);
	return {
		year,
		month,
		day
	};
}
function getTemporalNamespace() {
	const ns = globalThis.Temporal;
	if (ns === void 0) throw new Error("Temporal is not available in this runtime (requires Node.js >= 26 or a browser with Temporal support). With a polyfill, use Temporal.PlainDate.from(d.toGregorianParts()) or register the polyfill on globalThis.");
	return ns;
}
function temporalTimeParts(t) {
	const { hour, minute, second } = t;
	if (typeof hour !== "number") return void 0;
	return {
		hour,
		minute: typeof minute === "number" ? minute : 0,
		second: typeof second === "number" ? second : 0
	};
}
//#endregion
//#region src/time.ts
const TIME_REGEX = new RegExp(`(?<noon>正午)|(?:(?<ampm>午前|午後)\\s*)?(?<hour>[${NUM_CHARS}]+)\\s*時(?:\\s*(?:(?<half>半)|(?<min>[${NUM_CHARS}]+)\\s*分(?:\\s*(?<sec>[${NUM_CHARS}]+)\\s*秒)?))?`, "u");
const TIME_QUICK_FILTER = /時|正午/u;
const pad2 = (n) => String(n).padStart(2, "0");
function timeMatchToStr(g) {
	if (g["noon"] !== void 0) return "12:00";
	let hour = k2i(g["hour"] ?? "");
	if (g["ampm"] === "午後" && hour < 12) hour += 12;
	let min = 0;
	if (g["half"] !== void 0) min = 30;
	if (g["min"] !== void 0) min = k2i(g["min"]);
	if (g["sec"] === void 0) return `${pad2(hour)}:${pad2(min)}`;
	return `${pad2(hour)}:${pad2(min)}:${pad2(k2i(g["sec"]))}`;
}
/**
* 文字列中の最初の日本語時刻表記を等価な `"HH:MM"` / `"HH:MM:SS"` に置換して返す。
*
* 漢数字・全角数字の時分秒、午前/午後、半、正午に対応する。Ruby の `String#sub` と
* 同じく最初の1箇所だけを置換し、値の範囲チェックはしない (`二十五時` → `25:00`)。
* 「午前」は無変換、「午後」は12時未満のときだけ +12 する。時刻表記を含まない文字列は
* そのまま返す。
*
* @param str 変換対象の文字列
* @returns 最初の時刻表記を数字表記へ置換した文字列
* @example
* normalizeTime('午後三時半')            // => '15:30'
* normalizeTime('正午')                  // => '12:00'
* normalizeTime('平成元年五月四日十二時') // => '平成元年五月四日12:00'
*/
function normalizeTime(str) {
	const s = String(str);
	if (!TIME_QUICK_FILTER.test(s)) return s;
	return s.replace(TIME_REGEX, (...args) => {
		const groups = args[args.length - 1];
		return timeMatchToStr(groups);
	});
}
function toTimeParts(time) {
	if (time instanceof Date) {
		if (Number.isNaN(time.getTime())) throw new RangeError("formatTime() received an invalid Date");
		return {
			hour: time.getHours(),
			minute: time.getMinutes(),
			second: time.getSeconds()
		};
	}
	return time;
}
const TIME_KEY_PART = "T(?:[fF]|[HMS]k?)";
function formatTimeKey(t, key, opt) {
	switch (key) {
		case "Tf": return `${fmtNum(t.hour, opt)}時${fmtNum(t.minute, opt)}分${fmtNum(t.second, opt)}秒`;
		case "TF": return `${toKan(t.hour, "simple")}時${toKan(t.minute, "simple")}分${toKan(t.second, "simple")}秒`;
		case "TH": return i2z(t.hour);
		case "THk": return toKan(t.hour, "simple");
		case "TM": return i2z(t.minute);
		case "TMk": return toKan(t.minute, "simple");
		case "TS": return i2z(t.second);
		case "TSk": return toKan(t.second, "simple");
		default: return;
	}
}
/**
* 時刻オブジェクトまたは `Date` を、フォーマット文字列中の `%JT` 系ディレクティブに
* 従って展開する。`%J` 日付ディレクティブや `%%` などはそのまま残すので、呼び出し側で
* 後続処理できる。`Date` を渡した場合はローカル時刻の時/分/秒を使う。
*
* 使用できる `%JT` コードは README「%JT フォーマットディレクティブ」を参照。
*
* @param time 時・分・秒を持つ {@link TimeParts}、または `Date`
* @param fmt `%JT` 系コードを含むフォーマット文字列
* @returns `%JT` ディレクティブを展開した文字列
* @throws {RangeError} 無効な Date (Invalid Date) を渡したとき
* @example
* formatTime({ hour: 13, minute: 45, second: 6 }, '%JTHk時%JTMk分') // => '十三時四十五分'
*/
function formatTime(time, fmt) {
	const t = toTimeParts(time);
	return expandJDirectives(fmt, TIME_KEY_PART, (key, opt) => formatTimeKey(t, key, opt));
}
//#endregion
//#region src/parse.ts
function expandVariants(name) {
	return Array.from(name, (c) => {
		const variants = KANJI_VARIANTS[c];
		return variants === void 0 ? c : `[${c}${variants}]`;
	}).join("");
}
const ERA_ALT = [...ERA_NAME_KEYS, ...Object.keys(SQUARE_ERAS)].map(expandVariants).join("|");
const REGEX = new RegExp(`(?:(?<era_name>紀元前|${ERA_ALT})?(?:(?<year>[元${NUM_CHARS}]+)年))?(?:(?<is_leap>閏|潤|うるう)?(?:(?<month>[正${NUM_CHARS}]+)(?<is_leap_post>['’])?月|(?<alt_month>${ALT_MONTH_NAME.join("|")})))?(?:(?<day>[元朔晦${NUM_CHARS}]+)日|元旦)?`, "u");
function parseFields(str) {
	const s = String(str).replace(/\s+/gu, "");
	const match = REGEX.exec(s);
	if (!match || match[0] === "") throw new WarekiParseError(`Invalid Date: ${str}`);
	const g = match.groups;
	const era = g["era_name"] ?? "";
	let year;
	if (era === "" && g["year"] === void 0) year = (/* @__PURE__ */ new Date()).getFullYear();
	else {
		year = k2i(g["year"] ?? "");
		if (!(year > 0)) throw new WarekiParseError(`Invalid year: ${str}`);
	}
	if (era !== "" && era !== "紀元前" && !eraByName(era)) throw new WarekiParseError(`Date parse failed: Invalid era name '${era}'`);
	let month = 1;
	if (g["month"] !== void 0) month = k2i(g["month"]);
	else if (g["alt_month"] !== void 0) month = altMonthNameToNumber(g["alt_month"]);
	if (month > 12 || month < 1) throw new WarekiInvalidDateError(`invalid date (month out of range): ${str}`);
	const isLeap = g["is_leap"] !== void 0 || g["is_leap_post"] !== void 0;
	let day = 1;
	if (g["day"] !== void 0) if (g["day"] === "晦") day = lastDayOfEraMonth(era, eraYearToCivil(era, year), month, isLeap);
	else day = k2i(g["day"]);
	return {
		era,
		year,
		month,
		day,
		isLeap
	};
}
//#endregion
//#region src/wareki-date.ts
/**
* 和暦 (元号・旧暦) の1日付を表す immutable なクラス。
*
* TypeScript の `readonly` に加え、コンストラクタで `Object.freeze` されるため実行時も
* 不変。日付を変えるには {@link WarekiDate.with | with} / {@link WarekiDate.addDays | addDays}
* などで新しいインスタンスを作る。内部変換はすべてユリウス日 (JD) を経由する。
*
* @example
* const d = new WarekiDate('明治', 8, 2, 1)
* d.toDate()                    // => Date (1875-02-01)
* d.with({ month: 3 }).format() // => '明治八年三月一日'
*/
var WarekiDate = class WarekiDate {
	/** 元号名。元号を持たない (西暦・皇紀など) 場合は空文字列。 */
	eraName;
	/** 元号内の年 (元年 = 1)。元号を持たない場合は西暦年・皇紀年などそのままの値。 */
	eraYear;
	/** 西暦年 (先発グレゴリオ暦。紀元前は 0 以下)。内部変換の基準となる年。 */
	year;
	/** 月 (1〜12)。 */
	month;
	/** 日 (1 以上)。 */
	day;
	/** この月が閏月かどうか。 */
	isLeapMonth;
	#jd;
	/**
	* @param eraName 元号名 (`null` または `''` で元号なし)
	* @param eraYear 元号内の年 (元年 = 1)。元号なしのときは西暦年・皇紀年
	* @param month 月 (1〜12、既定 1)
	* @param day 日 (1 以上、既定 1)
	* @param isLeapMonth 閏月なら `true` (既定 `false`)
	* @throws {RangeError} eraYear が安全な整数でない、または元号・皇紀で 1 未満のとき
	* @throws {WarekiInvalidDateError} 月・日・閏月がその年で成立しないとき
	*/
	constructor(eraName, eraYear, month = 1, day = 1, isLeapMonth = false) {
		this.eraName = eraName ?? "";
		this.eraYear = eraYear;
		this.month = month;
		this.day = day;
		this.isLeapMonth = isLeapMonth;
		this.#validateEraYear();
		this.year = eraYearToCivil(this.eraName, eraYear);
		this.#validate();
		Object.freeze(this);
	}
	/**
	* 和暦文字列をパースする。トップレベルの {@link parse} と同じ実体。
	* @throws {WarekiParseError} 和暦日付として解釈できないとき
	* @throws {WarekiInvalidDateError} 和暦としては認識できたが日付として成立しないとき
	*/
	static parse(str) {
		const f = parseFields(str);
		return new WarekiDate(f.era, f.year, f.month, f.day, f.isLeap);
	}
	/**
	* ユリウス日から {@link WarekiDate} を作る。逆変換では北朝の元号を優先する
	* (南北朝合一後は明徳)。
	* @throws {UnsupportedDateRangeError} 対応する元号が無い (サポート範囲外) とき
	*/
	static fromJd(jd) {
		const era = findEraByJd(jd);
		if (!era) throw new UnsupportedDateRangeError(`Cannot find era for jd ${jd}`);
		const p = findDateParts(jd);
		const d = new WarekiDate(era.name, p.year - era.year + 1, p.month, p.day, p.isLeapMonth);
		d.#jd = jd;
		return d;
	}
	/**
	* Temporal オブジェクト (`PlainDate` / `PlainDateTime` / `ZonedDateTime`) から
	* {@link WarekiDate} を作る。非 ISO カレンダー (japanese 等) の値は
	* `withCalendar('iso8601')` で ISO の年月日に揃えてから変換する。構造的に判定するため
	* polyfill のインスタンスも受け付ける (グローバル `Temporal` は不要)。
	* `ZonedDateTime` はそのタイムゾーンのウォールクロック年月日を使う。
	* @throws {TypeError} Temporal の日付型と解釈できない値のとき
	* @throws {UnsupportedDateRangeError} サポート範囲外の日付のとき
	*/
	static fromTemporal(temporal) {
		if (!isTemporalDateLike(temporal)) throw new TypeError("WarekiDate.fromTemporal() expects a Temporal PlainDate / PlainDateTime / ZonedDateTime");
		const { year, month, day } = temporalToIsoParts(temporal);
		return WarekiDate.fromJd(gregorianToJd(year, month, day));
	}
	/**
	* `Date` から {@link WarekiDate} を作る。既定はローカルタイムゾーンの年月日、
	* `{ utc: true }` を渡すと UTC の年月日を使う。
	* @throws {RangeError} 無効な Date (Invalid Date) を渡したとき
	*/
	static fromDate(date, opts = {}) {
		if (Number.isNaN(date.getTime())) throw new RangeError("WarekiDate.fromDate() received an invalid Date");
		const [y, m, d] = opts.utc ? [
			date.getUTCFullYear(),
			date.getUTCMonth() + 1,
			date.getUTCDate()
		] : [
			date.getFullYear(),
			date.getMonth() + 1,
			date.getDate()
		];
		return WarekiDate.fromJd(gregorianToJd(y, m, d));
	}
	/** 現在日 (ローカル) の {@link WarekiDate}。 */
	static today() {
		return WarekiDate.fromDate(/* @__PURE__ */ new Date());
	}
	/** 皇紀 (神武天皇即位紀元) 年から {@link WarekiDate} を作る。 */
	static imperial(year, month = 1, day = 1, isLeapMonth = false) {
		return new WarekiDate("皇紀", year, month, day, isLeapMonth);
	}
	/** 皇紀 (神武天皇即位紀元) 年。 */
	get imperialYear() {
		return this.year - IMPERIAL_START_YEAR;
	}
	/** この年月 (閏月を含む) の末日。 */
	get lastDayOfMonth() {
		return lastDayOfEraMonth(this.eraName, this.year, this.month, this.isLeapMonth);
	}
	#monthIndex(leapMonth) {
		if (WESTERN_ERA_NAMES.includes(this.eraName) || this.year >= 1873) return this.month - 1;
		let idx = this.month - 1;
		if (this.isLeapMonth || leapMonth !== null && this.month > leapMonth) idx += 1;
		return idx;
	}
	#validateEraYear() {
		if (!Number.isSafeInteger(this.eraYear)) throw new RangeError(`invalid eraYear (must be a safe integer): ${this.eraYear}`);
		if (!WESTERN_ERA_NAMES.includes(this.eraName) && this.eraYear <= 0) throw new RangeError(`invalid eraYear (must be >= 1 for era '${this.eraName}'): ${this.eraYear}`);
	}
	#validate() {
		if (!(Number.isInteger(this.month) && this.month >= 1 && this.month <= 12)) throw new WarekiInvalidDateError(`invalid date (month out of range): ${this.inspect()}`);
		if (!(Number.isInteger(this.day) && this.day >= 1)) throw new WarekiInvalidDateError(`invalid date (day out of range): ${this.inspect()}`);
		if (!WESTERN_ERA_NAMES.includes(this.eraName) && this.year < 1873) {
			const yearIndex = yearDataIndex(this.year);
			if (yearIndex === void 0) return;
			const leapMonth = yearLeapMonth(yearIndex);
			if (this.isLeapMonth && leapMonth !== this.month) throw new WarekiInvalidDateError(`invalid date (no leap month): ${this.inspect()}`);
			const lastDay = yearMonthDays(yearIndex, this.#monthIndex(leapMonth));
			if (lastDay === void 0 || this.day > lastDay) throw new WarekiInvalidDateError(`invalid date (day out of range): ${this.inspect()}`);
		} else {
			if (this.isLeapMonth) throw new WarekiInvalidDateError(`invalid date (no leap month): ${this.inspect()}`);
			if (this.day > this.lastDayOfMonth) throw new WarekiInvalidDateError(`invalid date (day out of range): ${this.inspect()}`);
		}
	}
	/** デバッグ用の文字列表現 (例: `WarekiDate(令和1-1-1)`)。 */
	inspect() {
		return `WarekiDate(${this.eraName}${this.eraYear}-${this.isLeapMonth ? "閏" : ""}${this.month}-${this.day})`;
	}
	/**
	* この日付のユリウス日。初回アクセス時に計算してキャッシュする。
	* @throws {UnsupportedDateRangeError} 旧暦テーブルに存在しない年のとき
	*/
	get jd() {
		if (this.#jd !== void 0) return this.#jd;
		if (WESTERN_ERA_NAMES.includes(this.eraName)) return this.#jd = italyToJd(this.year, this.month, this.day);
		if (this.year >= 1873) return this.#jd = gregorianToJd(this.year, this.month, this.day);
		const yearIndex = yearDataIndex(this.year);
		if (yearIndex === void 0) throw new UnsupportedDateRangeError(`Cannot convert to jd ${this.inspect()}`);
		const leapMonth = yearLeapMonth(yearIndex);
		return this.#jd = yearMonthStart(yearIndex, this.#monthIndex(leapMonth)) + this.day - 1;
	}
	/** 先発グレゴリオ暦の年月日。JS の `Date` と同じ暦なので `Date` と整合する。 */
	toGregorianParts() {
		return jdToGregorian(this.jd);
	}
	/** ユリウス暦の年月日。Ruby 版 `Date` の年月日表記と一致する。 */
	toJulianParts() {
		return jdToJulian(this.jd);
	}
	/** ローカルタイムゾーンの深夜 (00:00:00) を指す `Date`。 */
	toDate() {
		const { year, month, day } = this.toGregorianParts();
		const d = /* @__PURE__ */ new Date(0);
		d.setFullYear(year, month - 1, day);
		d.setHours(0, 0, 0, 0);
		return d;
	}
	/**
	* ISO カレンダーの `Temporal.PlainDate` へ変換する。実行環境のグローバル `Temporal` を
	* 使うため、未搭載ランタイム (Node 18〜24 など) ではエラーになる。polyfill 利用時は
	* `Temporal.PlainDate.from(d.toGregorianParts())` を使うか、polyfill をグローバル登録
	* すること。
	* @throws {Error} グローバル `Temporal` が存在しないとき
	*/
	toPlainDate() {
		const ns = getTemporalNamespace();
		const { year, month, day } = this.toGregorianParts();
		return new ns.PlainDate(year, month, day);
	}
	/** 元号・年・月・日・閏月がすべて一致するか (暦表現としての同一性)。 */
	equals(other) {
		return other instanceof WarekiDate && other.year === this.year && other.month === this.month && other.day === this.day && other.eraYear === this.eraYear && other.eraName === this.eraName && other.isLeapMonth === this.isLeapMonth;
	}
	/** 同じ日 (同一 JD) を指すか。異なる暦表現でも JD が一致すれば `true`。 */
	isSameDay(other) {
		return other.jd === this.jd;
	}
	/** `n` 日後の {@link WarekiDate} を返す (新しいインスタンス)。 */
	addDays(n) {
		return WarekiDate.fromJd(this.jd + n);
	}
	/** `n` 日前の {@link WarekiDate} を返す (新しいインスタンス)。 */
	subDays(n) {
		return WarekiDate.fromJd(this.jd - n);
	}
	/**
	* 一部フィールドだけを差し替えた新しい {@link WarekiDate} を返す (immutable なので
	* 自身は変化しない)。
	* @example d.with({ month: 3 })
	*/
	with(fields) {
		return new WarekiDate(fields.eraName ?? this.eraName, fields.eraYear ?? this.eraYear, fields.month ?? this.month, fields.day ?? this.day, fields.isLeapMonth ?? this.isLeapMonth);
	}
	/**
	* フォーマット文字列に従って文字列化する (既定 `'%JF'`、例: `令和元年五月四日`)。
	* 使用できる `%J` 系コードは README「フォーマット文字列一覧」を参照。`WarekiDate` は
	* 時刻を持たないため `%JT` 系コードはリテラルのまま残る。
	*/
	format(fmt = "%JF") {
		return formatWareki(this, fmt);
	}
	/** 和暦年の漢数字。テンプレートリテラル向け (`%JGk`)。 */
	get eraYearKanji() {
		return formatWareki(this, "%JGk");
	}
	/** 和暦年の漢数字 (「元」の特殊記法対応、`%JGK`)。 */
	get eraYearKanjiSpecial() {
		return formatWareki(this, "%JGK");
	}
	/**
	* 旧暦年の漢数字 (`%JOk`)。
	* @throws {RangeError} 対象の年が紀元前 (負の西暦年) のとき (ya-kansuji の制約)
	*/
	get yearKanji() {
		return formatWareki(this, "%JOk");
	}
	/** 和暦月の漢数字 (`%JSk`)。 */
	get monthKanji() {
		return formatWareki(this, "%JSk");
	}
	/** 和暦月の別名 (睦月・如月・弥生…、`%JSK`)。 */
	get monthAltName() {
		return formatWareki(this, "%JSK");
	}
	/** 和暦日の漢数字 (`%JDk`)。 */
	get dayKanji() {
		return formatWareki(this, "%JDk");
	}
	/** 閏月なら `'閏'`、そうでなければ空文字列 (`%JLk`)。 */
	get leapMonthMark() {
		return formatWareki(this, "%JLk");
	}
};
//#endregion
//#region src/index.ts
/**
* 明治の改暦日 (明治6年1月1日 = グレゴリオ暦1873年1月1日) のユリウス日。
* この日以降が新暦 (グレゴリオ暦)、前日までが旧暦。Ruby の `Date::JAPAN` に相当する。
*/
const GREGORIAN_REFORM_JD = GREGORIAN_START_JD;
/** このライブラリのバージョン (`package.json` の `version` と一致)。 */
const VERSION = "0.2.0";
/**
* 和暦文字列をパースして {@link WarekiDate} を返す。時刻表記が続く場合は無視して
* 日付だけを返す (Ruby の `Date.parse` と同じ)。
*
* 元号・漢数字・旧字体・合字 (㍾㍽㍼㍻㋿)・閏月・月の別名・朔/晦/元旦などの慣用表記を
* 受け付ける。
*
* @param str 和暦日付を表す文字列 (例: `'元仁元年閏七月朔日'`)
* @returns パース結果の {@link WarekiDate}
* @throws {WarekiInvalidDateError} 和暦としては認識できたが日付として成立しないとき
* @throws {WarekiParseError} 和暦日付として解釈できないとき
* @throws {UnsupportedDateRangeError} サポート範囲外の日付のとき
* @example
* parse('天和3年閏5月4日').format('%JF') // => '天和三年閏五月四日'
*/
function parse(str) {
	return WarekiDate.parse(str);
}
const TIME_OF_DAY_REGEX = /(?<!\d)(\d+):(\d+)(?::(\d+))?(?!\d)/;
function extractTimeOfDay(str) {
	const m = TIME_OF_DAY_REGEX.exec(str);
	if (!m) return void 0;
	const hour = Number(m[1]);
	const min = Number(m[2]);
	const sec = m[3] === void 0 ? 0 : Number(m[3]);
	if (hour > 24 || hour === 24 && (min > 0 || sec > 0) || min > 59 || sec > 60) throw new WarekiParseError(`invalid time out of range: ${str}`);
	return {
		hour,
		min,
		sec
	};
}
/**
* 文字列を `Date` へ変換する。まず {@link normalizeTime} を適用し、和暦日付として
* 解釈できれば、時刻表記があればそれをローカル時刻としてセットした `Date` を返す。
* 和暦として解釈できなければ `new Date(正規化後の文字列)` にフォールバックする。
*
* @remarks
* 認識できたが日付として不成立な {@link WarekiInvalidDateError} の場合はフォールバック
* せず常に再 throw する (Ruby の `rescue InvalidDate; raise` 相当)。時刻抽出は元の
* 文字列が「時」または「正午」を含むときだけ行う。
*
* @param str 和暦日付 (＋任意の時刻表記) を表す文字列
* @returns 変換結果の `Date` (時刻表記が無ければローカル深夜)
* @throws {WarekiInvalidDateError} 和暦として認識できたが日付として成立しないとき
* @throws {WarekiParseError} 範囲外の時刻、または和暦としてもフォールバックとしても解釈できないとき
* @throws {UnsupportedDateRangeError} 和暦としてサポート範囲外で、フォールバックも失敗したとき
* @example
* parseToDate('平成元年五月四日十二時三十四分') // => Date (ローカル 1989-05-04 12:34:00)
* parseToDate('㍻一〇年 肆月 晦日')            // => Date (1998-04-30)
*/
function parseToDate(str) {
	const norm = normalizeTime(str);
	const tod = TIME_QUICK_FILTER.test(str) ? extractTimeOfDay(norm) : void 0;
	let dateOnly;
	let original;
	try {
		dateOnly = WarekiDate.parse(norm).toDate();
	} catch (e) {
		if (e instanceof WarekiInvalidDateError) throw e;
		if (!(e instanceof WarekiParseError) && !(e instanceof UnsupportedDateRangeError)) throw e;
		original = e;
	}
	if (dateOnly !== void 0) {
		if (tod) dateOnly.setHours(tod.hour, tod.min, tod.sec, 0);
		return dateOnly;
	}
	const fallback = new Date(norm);
	if (Number.isNaN(fallback.getTime())) throw original;
	return fallback;
}
/**
* `Date` または Temporal オブジェクト (`PlainDate` / `PlainDateTime` / `ZonedDateTime`) を
* {@link WarekiDate} へ変換する。`Date` はローカルタイムゾーンの年月日
* ({@link WarekiDate.fromDate})、Temporal は ISO の年月日 ({@link WarekiDate.fromTemporal})
* を使う。
*
* @param date 変換対象の `Date` または Temporal オブジェクト
* @returns 対応する {@link WarekiDate}
* @throws {RangeError} 無効な Date (Invalid Date) を渡したとき
* @throws {TypeError} Date でも Temporal の日付型でもない値を渡したとき
* @example
* toWarekiDate(new Date(1683, 5, 28)).format('%JF')                  // => '天和三年閏五月四日'
* toWarekiDate(Temporal.PlainDate.from('1683-06-28')).format('%JF')  // => '天和三年閏五月四日'
*/
function toWarekiDate(date) {
	if (date instanceof Date) return WarekiDate.fromDate(date);
	if (!isTemporalDateLike(date)) throw new TypeError("toWarekiDate() expects a Date or a Temporal date object");
	return WarekiDate.fromTemporal(date);
}
/**
* `Date`・{@link WarekiDate}・Temporal オブジェクトをフォーマット文字列に従って文字列化
* する。既定は `'%JF'` (例: `令和元年五月四日`)。使用できる `%J` / `%JT` コードは README
* 「フォーマット文字列一覧」を参照。
*
* `Date` はローカル時刻、`PlainDateTime` / `ZonedDateTime` はそのウォールクロック時刻から
* `%JT` 時刻ディレクティブを展開する。{@link WarekiDate} と `PlainDate` は時刻情報が無い
* ため `%JT` はリテラルのまま残る。
*
* @param date `Date`・{@link WarekiDate}・Temporal の日付オブジェクト
* @param fmt フォーマット文字列 (既定 `'%JF'`)
* @returns フォーマット済み文字列
* @throws {RangeError} 無効な Date (Invalid Date) を渡したとき
* @throws {TypeError} 対応しない型の値を渡したとき
* @example
* format(new Date(2019, 4, 4))                          // => '令和元年五月四日'
* format(Temporal.PlainDate.from('2019-05-04'), '%Jf')  // => '令和01年05月04日'
*/
function format(date, fmt = "%JF") {
	if (date instanceof WarekiDate) return date.format(fmt);
	if (date instanceof Date) {
		if (Number.isNaN(date.getTime())) throw new RangeError("format() received an invalid Date");
		const timeExpanded = formatTime(date, fmt);
		if (!hasJDateDirective(timeExpanded)) return stdStrftimeFromDate(date, timeExpanded);
		return WarekiDate.fromDate(date).format(timeExpanded);
	}
	if (!isTemporalDateLike(date)) throw new TypeError("format() expects a Date, WarekiDate, or Temporal date object");
	const time = temporalTimeParts(date);
	const timeExpanded = time ? formatTime(time, fmt) : fmt;
	if (!hasJDateDirective(timeExpanded)) {
		const { year, month, day } = temporalToIsoParts(date);
		return stdStrftimeFromParts(year, month, day, timeExpanded);
	}
	return WarekiDate.fromTemporal(date).format(timeExpanded);
}
//#endregion
export { ERA_TUPLES, ERA_NORTH_TUPLES, findDateParts, GREGORIAN_REFORM_JD, UnsupportedDateRangeError, VERSION, WarekiDate, WarekiInvalidDateError, WarekiParseError, format, formatTime, normalizeTime, parse, parseToDate, toWarekiDate };
