// 天文計算（旧暦の朔と中気、ヒジュラ暦の月の始まりの目安のため）。J. Meeus『Astronomical Algorithms』第2版の式。
// 時刻はユリウス日（JD、正午始まりの小数）。TT（力学時）と UT（世界時）の差 ΔT は Espenak & Meeus の近似式
const rad = Math.PI / 180, sin = d => Math.sin(d * rad), cos = d => Math.cos(d * rad);
const norm360 = d => ((d % 360) + 360) % 360;

// ΔT（秒）：年 y の TT − UT
export function deltaT(y) {
  let t;
  if (y < 1860) { t = (y - 1800) / 100; return y < 1800 ? -20 + 32 * ((y - 1820) / 100) ** 2 : 13.72 - 33.2447 * t + 68.612 * t * t + 4111.6 * t ** 3 - 37436 * t ** 4 + 121272 * t ** 5 - 169900 * t ** 6 + 87500 * t ** 7; }
  if (y < 1900) { t = y - 1860; return 7.62 + 0.5737 * t - 0.251754 * t * t + 0.01680668 * t ** 3 - 0.0004473624 * t ** 4 + t ** 5 / 233174; }
  if (y < 1920) { t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t ** 3 - 0.000197 * t ** 4; }
  if (y < 1941) { t = y - 1920; return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t ** 3; }
  if (y < 1961) { t = y - 1950; return 29.07 + 0.407 * t - t * t / 233 + t ** 3 / 2547; }
  if (y < 1986) { t = y - 1975; return 45.45 + 1.067 * t - t * t / 260 - t ** 3 / 718; }
  if (y < 2005) { t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
  if (y < 2050) { t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
  if (y < 2150) return -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y);
  return -20 + 32 * ((y - 1820) / 100) ** 2;
}
export const yearOfJd = jd => 2000 + (jd - 2451545) / 365.25;
export const ttToUt = jde => jde - deltaT(yearOfJd(jde)) / 86400;
export const utToTt = jd => jd + deltaT(yearOfJd(jd)) / 86400;

// 太陽の視黄経（度）。精度は約0.01度（時刻にして約15分）
export function sunLongitude(jde) {
  const T = (jde - 2451545) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
  const om = 125.04 - 1934.136 * T;
  return norm360(L0 + C - 0.00569 - 0.00478 * sin(om));
}
// 太陽が黄経 lon（度）に来る時刻（JDE）。guess の近く
export function sunAt(lon, guess) {
  let t = guess;
  for (let i = 0; i < 20; i++) {
    let d = lon - sunLongitude(t);
    d = ((d + 180) % 360 + 360) % 360 - 180;
    t += d / 0.98564736;
    if (Math.abs(d) < 1e-7) break;
  }
  return t;
}

// 朔（新月）の時刻（JDE）。k は2000年1月6日の朔からの番号（整数）
export function newMoon(k) {
  const T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.000000150 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = 2.5534 + 29.10535670 * k - 0.0000014 * T2 - 0.00000011 * T3;
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
  const Om = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;
  jde += -0.40720 * sin(Mp) + 0.17241 * E * sin(M) + 0.01608 * sin(2 * Mp) + 0.01039 * sin(2 * F) + 0.00739 * E * sin(Mp - M)
    - 0.00514 * E * sin(Mp + M) + 0.00208 * E * E * sin(2 * M) - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F)
    + 0.00056 * E * sin(2 * Mp + M) - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F)
    - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(Om) - 0.00007 * sin(Mp + 2 * M) + 0.00004 * sin(2 * Mp - 2 * F)
    + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F) + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F)
    + 0.00003 * sin(Mp - M + 2 * F) - 0.00002 * sin(Mp - M - 2 * F) - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp);
  const A = [[299.77, 0.107408, -0.009173], [251.88, 0.016321], [251.83, 26.651886], [349.42, 36.412478], [84.66, 18.206239], [141.74, 53.303771],
    [207.14, 2.453732], [154.84, 7.306860], [34.52, 27.261239], [207.19, 0.121824], [291.34, 1.844379], [161.72, 24.198154], [239.56, 25.513099], [331.55, 3.592518]];
  const W = [0.000325, 0.000165, 0.000164, 0.000126, 0.000110, 0.000062, 0.000060, 0.000056, 0.000047, 0.000042, 0.000040, 0.000037, 0.000035, 0.000023];
  A.forEach(([a, b, c = 0], i) => { jde += W[i] * sin(a + b * k + c * T2); });
  return jde;
}
// JD の近くの朔の番号
export const moonIndexNear = jd => Math.round((jd - 2451550.09766) / 29.530588861);

// 月と太陽の位置（低精度。ヒジュラ暦の新月の見え方の目安に使う。月は主な項だけで、誤差は0.3度ほど）
export function moonPosition(jde) {
  const T = (jde - 2451545) / 36525;
  const Lp = 218.3164477 + 481267.88123421 * T, D = 297.8501921 + 445267.1114034 * T, M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T, F = 93.2720950 + 483202.0175233 * T;
  const lon = Lp + 6.288774 * sin(Mp) + 1.274027 * sin(2 * D - Mp) + 0.658314 * sin(2 * D) + 0.213618 * sin(2 * Mp) - 0.185116 * sin(M)
    - 0.114332 * sin(2 * F) + 0.058793 * sin(2 * D - 2 * Mp) + 0.057066 * sin(2 * D - M - Mp) + 0.053322 * sin(2 * D + Mp) + 0.045758 * sin(2 * D - M)
    - 0.040923 * sin(M - Mp) - 0.034720 * sin(D) - 0.030383 * sin(M + Mp);
  const lat = 5.128122 * sin(F) + 0.280602 * sin(Mp + F) + 0.277693 * sin(Mp - F) + 0.173237 * sin(2 * D - F) + 0.055413 * sin(2 * D - Mp + F) + 0.046271 * sin(2 * D - Mp - F);
  return { lon: norm360(lon), lat };
}
// 黄道座標 → 赤道座標（度）
export function eclToEq(lon, lat, jde) {
  const T = (jde - 2451545) / 36525, e = 23.439291 - 0.0130042 * T;
  const ra = Math.atan2(sin(lon) * cos(e) - Math.tan(lat * rad) * sin(e), cos(lon)) / rad;
  const dec = Math.asin(sin(lat) * cos(e) + cos(lat) * sin(e) * sin(lon)) / rad;
  return { ra: norm360(ra), dec };
}
// グリニッジ平均恒星時（度）
export const gmst = jd => norm360(280.46061837 + 360.98564736629 * (jd - 2451545));
// 地平座標の高度（度）。lat・lon は観測地（東経が正）
export function altitude(ra, dec, jd, lat, lon) {
  const H = gmst(jd) + lon - ra;
  return Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H)) / rad;
}
// 日没の時刻（UT の JD）。jdn の日の、観測地（lat 北緯、lon 東経）での日没（太陽の上の縁が地平線に沈む）。沈まない日は null
export function sunset(jdn, lat, lon) {
  const jd0 = jdn - 0.5, th0 = gmst(jd0);
  let m = ((0.75 - lon / 360) % 1 + 1) % 1;
  for (let i = 0; i < 6; i++) {
    const tt = utToTt(jd0 + m), s = eclToEq(sunLongitude(tt), 0, tt);
    const c = (sin(-0.833) - sin(lat) * sin(s.dec)) / (cos(lat) * cos(s.dec));
    if (c < -1 || c > 1) return null;
    const transit = (s.ra - lon - th0) / 360.985647;
    m = ((transit + Math.acos(c) / rad / 360.985647) % 1 + 1) % 1;
  }
  return jd0 + m;
}
// 月と太陽の離角（度）
export function elongation(jde) {
  const m = moonPosition(jde), s = sunLongitude(jde);
  return Math.acos(cos(m.lat) * cos(m.lon - s)) / rad;
}
