//#region src/constants.ts
/** 10^1〜10^3 の位を表す漢数字の単位（十・百・千）。 */
const UNIT_EXP3 = [
	"十",
	"百",
	"千"
];
/** 10^4 ごとに繰り上がる漢数字の単位（万・億・兆…無量大数）。 */
const UNIT_EXP4 = [
	"万",
	"億",
	"兆",
	"京",
	"垓",
	"𥝱",
	"穣",
	"溝",
	"澗",
	"正",
	"載",
	"極",
	"恒河沙",
	"阿僧祇",
	"那由他",
	"不可思議",
	"無量大数"
];
/** 10^-1〜10^-21 の位を表す小数の単位（分・厘・毛…清浄）。 */
const UNIT_FRAC = [
	"分",
	"厘",
	"毛",
	"糸",
	"忽",
	"微",
	"繊",
	"沙",
	"塵",
	"埃",
	"渺",
	"漠",
	"模糊",
	"逡巡",
	"須臾",
	"瞬息",
	"弾指",
	"刹那",
	"六徳",
	"虚空",
	"清浄"
];
const KAN_DIGITS = "〇一二三四五六七八九";
const NUM_ALT_CHARS = `${KAN_DIGITS}０１２３４５６７８９零壱壹弌弐貳貮参參弎肆伍陸漆質柒捌玖拾什陌佰阡仟萬秭`;
const NUM_NORMALIZED_CHARS = "01234567890123456789011122233345677789十十百百千千万𥝱";
//#endregion
//#region src/parse.ts
const altChars = Array.from(NUM_ALT_CHARS);
const normChars = Array.from(NUM_NORMALIZED_CHARS);
const NORMALIZE_MAP = new Map(altChars.map((c, i) => [c, normChars[i]]));
const SEPARATORS = /* @__PURE__ */ new Set([
	",",
	"，",
	"、",
	"	",
	"\n",
	"\v",
	"\f",
	"\r",
	" ",
	"\xA0",
	" ",
	" ",
	" ",
	" ",
	" ",
	" ",
	" ",
	" ",
	" ",
	" ",
	" ",
	" ",
	"\u2028",
	"\u2029",
	" ",
	" ",
	"　",
	"﻿"
]);
const DIGIT_VALUES = [
	0n,
	1n,
	2n,
	3n,
	4n,
	5n,
	6n,
	7n,
	8n,
	9n
];
const SPECIAL_NUMBER_VALUES = /* @__PURE__ */ new Map([
	["卄", 20n],
	["廿", 20n],
	["卅", 30n],
	["丗", 30n],
	["卌", 40n],
	["皕", 200n]
]);
const SINGLE_UNITS = [...UNIT_EXP3, ...UNIT_EXP4.filter((u) => Array.from(u).length === 1)];
const MULTI_UNITS = UNIT_EXP4.filter((u) => Array.from(u).length > 1);
const CHAR_CLASS = [.../* @__PURE__ */ new Set([
	...altChars,
	...normChars,
	...SINGLE_UNITS,
	...SPECIAL_NUMBER_VALUES.keys()
])].join("");
const PART_SOURCE = `${MULTI_UNITS.join("|")}|[${CHAR_CLASS}]`;
const KANSUJI_REGEXP = new RegExp(`(?:マイナス)?(?:${PART_SOURCE})+`, "u");
const PART_REGEXP = new RegExp(PART_SOURCE, "gu");
function createUnitValues(units, base) {
	let value = base;
	return new Map(units.map((unit) => {
		const entry = [unit, value];
		value *= base;
		return entry;
	}));
}
const UNIT_EXP3_VALUES = createUnitValues(UNIT_EXP3, 10n);
const UNIT_EXP4_VALUES = createUnitValues(UNIT_EXP4, 10000n);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
/** toBigInt / toNumber が受け付ける入力の最大長（UTF-16 コードユニット数）。 */
const MAX_INPUT_LENGTH = 16384;
function assertMaxInputLength(str) {
	if (str.length > 16384) throw new RangeError(`kansuji input exceeds maximum length of ${MAX_INPUT_LENGTH} UTF-16 code units`);
}
function clean(str) {
	let result = "";
	for (const c of str) {
		const normalized = NORMALIZE_MAP.get(c) ?? c;
		if (!SEPARATORS.has(normalized)) result += normalized;
	}
	return result;
}
/**
* 漢数字・大字・全角数字が混じったテキストを bigint に変換する。
*
* 照合前にカンマ・読点・各種空白などの区切り文字を除去し、先頭から連続してマッチする
* 数値表現だけを読み取る（例: `toBigInt('五x六')` は `5n`）。マッチしなければ `0n` を返す。
* 先頭の「マイナス」は負号として扱うが、ASCII の `-` や U+2212（−）は負号として扱わない。
* 値の上限はなく、無量大数（10^68）を超える大きさもそのまま扱える。
* 入力長が {@link MAX_INPUT_LENGTH} を超える場合は `RangeError` を投げる。
*
* @param str 変換対象の文字列
* @returns テキストが表す整数値
* @throws {RangeError} 入力長が {@link MAX_INPUT_LENGTH} を超える場合
* @example
* toBigInt('一〇二四')       // => 1024n
* toBigInt('マイナス千二百') // => -1200n
* toBigInt('一無量大数')     // => 10n ** 68n
*/
function toBigInt(str) {
	const s = String(str);
	assertMaxInputLength(s);
	const cleaned = clean(s);
	const matched = KANSUJI_REGEXP.exec(cleaned);
	if (!matched) return 0n;
	const matchedText = matched[0];
	if (matchedText === void 0) return 0n;
	let ret3 = 0n;
	let ret4 = 0n;
	let curnum = null;
	for (const c of matchedText.match(PART_REGEXP) ?? []) if (c >= "1" && c <= "9") {
		const digit = DIGIT_VALUES[c.charCodeAt(0) - 48];
		curnum = (curnum ?? 0n) * 10n + digit;
	} else if (c === "0") {
		if (curnum !== null) curnum *= 10n;
	} else {
		const specialNumber = SPECIAL_NUMBER_VALUES.get(c);
		if (specialNumber !== void 0) {
			ret3 += specialNumber;
			curnum = null;
		} else {
			const unit4 = UNIT_EXP4_VALUES.get(c);
			if (unit4 !== void 0) {
				if (curnum !== null) {
					ret3 += curnum;
					curnum = null;
				}
				if (ret3 === 0n) ret3 = 1n;
				ret4 += ret3 * unit4;
				ret3 = 0n;
			} else {
				const unit3 = UNIT_EXP3_VALUES.get(c);
				if (unit3 !== void 0) {
					curnum ??= 1n;
					ret3 += curnum * unit3;
					curnum = null;
				}
			}
		}
	}
	if (curnum !== null) ret3 += curnum;
	const ret = ret4 + ret3;
	return matchedText.startsWith("マイナス") ? -ret : ret;
}
/**
* {@link toBigInt} と同じ規則でテキストを解釈し、`number` として返す。
*
* 結果の絶対値が `Number.MAX_SAFE_INTEGER`（2^53 − 1）を超える場合は `RangeError` を
* 投げる。安全整数を超えうる値を扱うときは {@link toBigInt} を使うこと。
*
* @param str 変換対象の文字列
* @returns テキストが表す数値
* @throws {RangeError} 値が安全整数の範囲を超える場合
* @throws {RangeError} 入力長が {@link MAX_INPUT_LENGTH} を超える場合
* @example
* toNumber('一〇二四')   // => 1024
* toNumber('一無量大数') // throws RangeError
*/
function toNumber(str) {
	const value = toBigInt(str);
	if (value > MAX_SAFE_BIGINT || value < -MAX_SAFE_BIGINT) throw new RangeError(`kansuji value exceeds Number.MAX_SAFE_INTEGER: ${str}`);
	return Number(value);
}
//#endregion
//#region src/value.ts
const FRAC_DIGITS = UNIT_FRAC.length;
const FRAC_BASE = 10n ** BigInt(FRAC_DIGITS);
const NO_FRACTION = Object.freeze([]);
const DECIMAL_REGEXP = /^(-)?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
function normalizeDecimalString(str) {
	const m = DECIMAL_REGEXP.exec(str);
	if (!m) throw new RangeError(`kansuji value must be a decimal number string: ${str}`);
	const negative = m[1] === "-";
	const digits = m[2] + (m[3] ?? "");
	if (!/[1-9]/.test(digits)) return {
		negative: false,
		value: 0n
	};
	const exp = m[4] === void 0 ? 0 : Number(m[4]);
	const pointPos = m[2].length + exp;
	if (pointPos > 16384) throw new RangeError(`decimal exponent out of supported range: ${str}`);
	const scaledLen = pointPos + FRAC_DIGITS;
	if (scaledLen < 0) return {
		negative: false,
		value: 0n
	};
	let scaled;
	if (scaledLen >= digits.length) scaled = BigInt(digits) * 10n ** BigInt(scaledLen - digits.length);
	else {
		scaled = scaledLen === 0 ? 0n : BigInt(digits.slice(0, scaledLen));
		if (digits.charAt(scaledLen) >= "5") scaled += 1n;
	}
	if (scaled === 0n) return {
		negative: false,
		value: 0n
	};
	const int = scaled / FRAC_BASE;
	const fracScaled = scaled % FRAC_BASE;
	if (fracScaled === 0n) return {
		negative,
		value: int
	};
	const fracChars = fracScaled.toString().padStart(FRAC_DIGITS, "0").replace(/0+$/, "");
	return {
		negative,
		value: {
			int,
			frac: Array.from(fracChars, Number)
		}
	};
}
function normalizeValue(num) {
	if (typeof num === "bigint") return num < 0n ? {
		negative: true,
		value: -num
	} : {
		negative: false,
		value: num
	};
	if (typeof num === "number") {
		if (!Number.isFinite(num)) throw new RangeError(`kansuji value must be finite: ${num}`);
		if (Number.isInteger(num)) {
			if (!Number.isSafeInteger(num)) throw new RangeError(`kansuji value must be a safe integer, bigint, or decimal string: ${num}`);
			return num < 0 ? {
				negative: true,
				value: BigInt(-num)
			} : {
				negative: false,
				value: BigInt(num)
			};
		}
		return normalizeDecimalString(String(num));
	}
	assertMaxInputLength(num);
	return normalizeDecimalString(num);
}
/**
* 値を整数部と小数桁の列に分解する。
*
* フォーマッタ実装向けのヘルパ。{@link toKan} から渡された値（bigint または
* {@link KansujiFraction}）のほか、number や 10 進文字列も直接受け付ける。
* 小数桁は小数第 1 位（分）から順で、末尾ゼロは取り除かれる。第 22 位以下は
* 四捨五入される。
*
* @param num 分解する値
* @returns `[整数部, 小数桁の配列]`。整数なら小数桁は空配列
* @throws {RangeError} 値が負の場合、または number・文字列・オブジェクトとして不正な場合
* @example
* splitFraction(123n)      // => [123n, []]
* splitFraction('123.456') // => [123n, [4, 5, 6]]
* splitFraction('1.05')    // => [1n, [0, 5]]
*/
function splitFraction(num) {
	if (typeof num === "object" && num !== null) {
		if (typeof num.int !== "bigint" || !Array.isArray(num.frac)) throw new RangeError("splitFraction requires a KansujiFraction with a bigint int and an array frac");
		if (num.int < 0n) throw new RangeError("Value must be non-negative");
		return [num.int, num.frac];
	}
	const { negative, value } = normalizeValue(num);
	if (negative) throw new RangeError("Value must be non-negative");
	return typeof value === "bigint" ? [value, NO_FRACTION] : [value.int, value.frac];
}
//#endregion
//#region src/groups.ts
const GROUP_BASE = 10000n;
const GROUP_UNITS = ["", ...UNIT_EXP4];
const GROUP_COUNT = GROUP_UNITS.length;
const MAX_EXCLUSIVE = GROUP_BASE ** BigInt(GROUP_COUNT);
const MAX_DIGITS = GROUP_COUNT * 4;
function groups4(num) {
	if (num < 0n || num >= MAX_EXCLUSIVE) throw new RangeError(`Kansuji formatters require a bigint between 0 and 10^${MAX_DIGITS} - 1`);
	const ret = [];
	let value = num;
	let unitIndex = 0;
	do {
		const unit = GROUP_UNITS[unitIndex];
		if (unit === void 0) throw new RangeError(`Kansuji formatters require a bigint between 0 and 10^${MAX_DIGITS} - 1`);
		ret.push([Number(value % GROUP_BASE), unit]);
		value /= GROUP_BASE;
		unitIndex++;
	} while (value > 0n);
	return ret.reverse();
}
//#endregion
//#region src/formatter/gov.ts
/**
* 「公用文作成の要領」方式で整形する（4桁ごとにアラビア数字＋漢字単位、読点区切り）。
*
* 小数部は `.` に続けてアラビア数字で出力する。小数部があるとき一の位のまとまりは
* 0 でも省略しない（`1234万, 0.5`）。
*
* @param num 整数部が 0 以上 `10^72 − 1` 以下の値
* @returns 整形後の文字列。`0n` は `'0'`
* @throws {RangeError} 範囲外・負の値の場合。負数の整形には {@link toKan} を使う
* @example
* gov(12340005n)                          // => '1234万, 5'
* gov({ int: 12_340_000n, frac: [5] })    // => '1234万, 0.5'
*/
function gov(num) {
	const [int, frac] = splitFraction(num);
	const fracPart = frac.length === 0 ? "" : `.${frac.join("")}`;
	if (int === 0n) return `0${fracPart}`;
	const groups = groups4(int);
	const parts = [];
	for (const [idx, [i4, unit4]] of groups.entries()) {
		if (i4 === 0 && !(fracPart !== "" && idx === groups.length - 1)) continue;
		parts.push(`${i4}${unit4}`);
	}
	return parts.join(", ") + fracPart;
}
//#endregion
//#region src/formatter/judic.ts
function judic(num, zero, sep, mapDigits) {
	const [int, frac] = splitFraction(num);
	if (int === 0n && frac.length === 0) return zero;
	let ret = "";
	let head = true;
	const groups = groups4(int);
	for (const [idx, [i4, unit4]] of groups.entries()) {
		if (i4 === 0 && !(frac.length > 0 && idx === groups.length - 1)) continue;
		ret += (head ? String(i4) : String(i4).padStart(4, "0")) + unit4;
		head = false;
	}
	if (frac.length > 0) ret += sep + frac.join("");
	return mapDigits(ret);
}
/**
* 裁判判例の縦書き方式で整形する（4桁ごとに漢数字、下位グループはゼロ埋め、単位は漢字）。
*
* 小数部は「・」に続けて漢数字の位取りで出力する。小数部があるとき一の位のまとまりは
* 0 でもゼロ埋めして出力する（`一二三四万〇〇〇〇・五`）。
*
* @param num 整数部が 0 以上 `10^72 − 1` 以下の値
* @returns 整形後の文字列。`0n` は `'〇'`
* @throws {RangeError} 範囲外・負の値の場合。負数の整形には {@link toKan} を使う
* @example
* judicV(12340005n)                    // => '一二三四万〇〇〇五'
* judicV({ int: 3n, frac: [1, 4] })    // => '三・一四'
*/
function judicV(num) {
	return judic(num, "〇", "・", (s) => s.replace(/[0-9]/g, (d) => KAN_DIGITS.charAt(Number(d))));
}
/**
* 最高裁判例の横書き方式で整形する（4桁ごとに全角数字、下位グループはゼロ埋め）。
*
* 小数部は「．」に続けて全角数字で出力する。小数部があるとき一の位のまとまりは
* 0 でもゼロ埋めして出力する（`１２３４万００００．５`）。
*
* @param num 整数部が 0 以上 `10^72 − 1` 以下の値
* @returns 整形後の文字列。`0n` は `'０'`
* @throws {RangeError} 範囲外・負の値の場合。負数の整形には {@link toKan} を使う
* @example
* judicH(12340005n)                    // => '１２３４万０００５'
* judicH({ int: 1n, frac: [0, 5] })    // => '１．０５'
*/
function judicH(num) {
	return judic(num, "０", "．", (s) => s.replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 65248)));
}
//#endregion
//#region src/formatter/lawyer.ts
/**
* 行政・司法で用いられる方式で整形する（4桁ごとにアラビア数字＋漢字単位、千の位にカンマ）。
*
* 小数部は `.` に続けてアラビア数字で出力する。小数部があるとき一の位のまとまりは
* 0 でも省略しない（`1,234万0.5`）。
*
* @param num 整数部が 0 以上 `10^72 − 1` 以下の値
* @returns 整形後の文字列。`0n` は `'0'`
* @throws {RangeError} 範囲外・負の値の場合。負数の整形には {@link toKan} を使う
* @example
* lawyer(12340005n)                       // => '1,234万5'
* lawyer({ int: 12_345_678n, frac: [9] }) // => '1,234万5,678.9'
*/
function lawyer(num) {
	const [int, frac] = splitFraction(num);
	const fracPart = frac.length === 0 ? "" : `.${frac.join("")}`;
	if (int === 0n) return `0${fracPart}`;
	let ret = "";
	const groups = groups4(int);
	for (const [idx, [i4, unit4]] of groups.entries()) {
		if (i4 === 0 && !(fracPart !== "" && idx === groups.length - 1)) continue;
		const s = String(i4);
		ret += (i4 >= 1e3 ? `${s[0]},${s.slice(1)}` : s) + unit4;
	}
	return ret + fracPart;
}
//#endregion
//#region src/formatter/simple.ts
const POWERS_10 = [
	1,
	10,
	100,
	1e3
];
/**
* 標準的な漢数字へ整形する（位ごとに漢数字の単位を使う）。
*
* 小数部は分（10^-1）〜清浄（10^-21）の命数法で出力し、整数部があれば「・」で区切る。
*
* @param num 整数部が 0 以上 `10^72 − 1` 以下の値
* @returns 漢数字文字列。`0n` は `'零'`
* @throws {RangeError} 範囲外・負の値の場合。負数の整形には {@link toKan} を使う
* @example
* simple(12345n)                    // => '一万二千三百四十五'
* simple(10003n)                    // => '一万三'
* simple({ int: 1n, frac: [0, 5] }) // => '一・五厘'
*/
function simple(num) {
	const [int, frac] = splitFraction(num);
	if (int === 0n && frac.length === 0) return "零";
	let ret = "";
	for (const [i4, unit4] of groups4(int)) {
		if (i4 === 0) continue;
		for (let j = UNIT_EXP3.length; j >= 0; j--) {
			const unit3 = UNIT_EXP3[j - 1] ?? "";
			const i3 = Math.floor(i4 / (POWERS_10[j] ?? 1)) % 10;
			if (i3 === 0) continue;
			ret += i3 === 1 && unit3 !== "" ? unit3 : KAN_DIGITS.charAt(i3) + unit3;
		}
		ret += unit4;
	}
	if (frac.length > 0) {
		if (ret !== "") ret += "・";
		for (const [idx, d] of frac.entries()) if (d !== 0) ret += KAN_DIGITS.charAt(d) + UNIT_FRAC[idx];
	}
	return ret;
}
//#endregion
//#region src/formatters.ts
const formatters = /* @__PURE__ */ new Map([
	["simple", simple],
	["gov", gov],
	["lawyer", lawyer],
	["judic_v", judicV],
	["judic_h", judicH]
]);
/**
* フォーマッタを名前付きで登録する。既存の同名フォーマッタ（ビルトイン含む）は警告なく
* 上書きされる。
*
* レジストリは ESM 版と CJS 版で共有されない。登録側と利用側は同じモジュール形式
* (`import` または `require`) で `ya-kansuji` を読み込むこと。
*
* @param name フォーマッタ名。{@link toKan} の第2引数に渡して選択する
* @param formatter `(num: KansujiValue, options?) => string`。`num` は常に 0 以上の正規化済みの値
* @throws {TypeError} `formatter` が関数でない場合
*/
function registerFormatter(name, formatter) {
	if (typeof formatter !== "function") throw new TypeError("Registering invalid formatter.");
	formatters.set(name, formatter);
}
/**
* 登録済みフォーマッタを名前で取得する。未登録なら `undefined`。
*
* @param name フォーマッタ名
* @returns フォーマッタ関数、なければ `undefined`
*/
function getFormatter(name) {
	return formatters.get(name);
}
/**
* 数値を漢数字・漢字混じりの文字列へ整形する。
*
* 負数は先頭に「マイナス」を付け、絶対値をフォーマッタに渡す（フォーマッタが受け取るのは
* 常に非負の正規化済み値）。整数の `number` は安全整数でなければならず、より大きな値は
* `bigint` か 10 進文字列で渡すこと。非整数の `number` は `String(num)` の最短 10 進表現
* として解釈する。文字列は `-?\d+(\.\d+)?([eE][+-]?\d+)?` 形式のみ受け付け、長さは
* {@link MAX_INPUT_LENGTH} まで。小数部は 10^-21（清浄）で四捨五入する。
* ビルトインフォーマッタが表現できるのは整数部の絶対値 `10^72 − 1` まで。
*
* @param num 変換対象。`number`、`bigint`、または 10 進数文字列
* @param formatter フォーマッタ名、またはフォーマッタ関数。既定は `'simple'`
* @param options フォーマッタへ渡すオプション（ビルトインは未使用）
* @returns 整形後の文字列
* @throws {RangeError} `num` が NaN・無限大・安全整数を超える整数 `number`・不正な形式の
*   文字列、またはビルトインフォーマッタの表現範囲を超える場合
* @throws {TypeError} 指定した名前のフォーマッタが見つからない場合
* @example
* toKan(12345)           // => '一万二千三百四十五'
* toKan(12340005, 'gov') // => '1234万, 5'
* toKan(-1234)           // => 'マイナス千二百三十四'
* toKan(1.05)            // => '一・五厘'
* toKan('123.456', 'gov') // => '123.456'
*/
function toKan(num, formatter = "simple", options = {}) {
	const { negative, value } = normalizeValue(num);
	const fn = typeof formatter === "function" ? formatter : formatters.get(formatter);
	if (!fn) throw new TypeError(`Unable to find formatter ${String(formatter)}`);
	const ret = fn(value, options);
	return negative ? `マイナス${ret}` : ret;
}
//#endregion
export { MAX_INPUT_LENGTH, UNIT_EXP3, UNIT_EXP4, UNIT_FRAC, getFormatter, gov, judicH, judicV, lawyer, registerFormatter, simple, splitFraction, toBigInt, toKan, toNumber };
