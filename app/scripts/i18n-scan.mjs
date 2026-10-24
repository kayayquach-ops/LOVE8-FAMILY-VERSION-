// Đọc mã TS/TSX, tách ra các mẩu chữ có dấu tiếng Việt: chuỗi '...' "...", chuỗi `...` (biểu thức ${} thay bằng {}),
// và chữ nằm ngoài chuỗi (chữ JSX, biểu thức chính quy). Bỏ qua chú thích. Dùng chung cho i18n-check và i18n-compare.

export const VI = /[À-ÃÈ-ÊÌÍÒ-ÕÙÚÝà-ãè-êìíò-õùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ]/;

/** Trả về [{ text, line, kind: 'str' | 'tpl' | 'code' }] cho mọi mẩu có chữ Việt. */
export function scan(src) {
  src = src.replace(/\r\n/g, '\n');
  const out = [];
  const lineAt = (() => {
    const starts = [0];
    for (let k = 0; k < src.length; k++) if (src[k] === '\n') starts.push(k + 1);
    return (pos) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= pos) lo = m; else hi = m - 1; } return lo + 1; };
  })();
  let i = 0;
  let prev = ''; // ký tự có nghĩa gần nhất trong mã, để đoán dấu / là chia hay biểu thức chính quy
  const emit = (text, at, kind) => { if (VI.test(text)) out.push({ text, line: lineAt(at), kind }); };

  function readString(q) {
    const at = i; i++;
    let s = '';
    while (i < src.length && src[i] !== q && src[i] !== '\n') { if (src[i] === '\\') { s += src[i + 1]; i += 2; } else s += src[i++]; }
    i++;
    emit(s, at, 'str');
  }
  function readRegex() {
    const at = i; i++;
    let s = '', cls = false;
    while (i < src.length && src[i] !== '\n') {
      const ch = src[i];
      if (ch === '\\') { s += ch + src[i + 1]; i += 2; continue; }
      if (ch === '[') cls = true; else if (ch === ']') cls = false;
      else if (ch === '/' && !cls) break;
      s += ch; i++;
    }
    i++;
    while (/[a-z]/i.test(src[i] ?? '')) i++;
    emit(s, at, 'code');
  }
  function readTemplate() {
    const at = i; i++;
    let s = '';
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { s += src[i + 1]; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') { i += 2; s += '{}'; readCode(true); continue; }
      s += src[i++];
    }
    i++;
    emit(s, at, 'tpl');
  }
  function readCode(untilBrace) {
    let depth = 0, run = '', runAt = i;
    const flush = () => { if (run.trim()) emit(run.trim(), runAt, 'code'); run = ''; runAt = i; };
    while (i < src.length) {
      const ch = src[i], nx = src[i + 1];
      if (ch === '/' && nx === '/') { flush(); while (i < src.length && src[i] !== '\n') i++; continue; }
      if (ch === '/' && nx === '*') { flush(); i = src.indexOf('*/', i + 2); i = i < 0 ? src.length : i + 2; continue; }
      if (ch === "'" || ch === '"') {
        // Dấu nháy trong chữ JSX (như "con vẫn ổn") không mở chuỗi: chỉ coi là chuỗi khi đứng sau ký tự của mã.
        if (/[=(,:[?{}&|!+;]|^$/.test(prev) || /\b(return|case)$/.test(run.trimEnd())) { flush(); readString(ch); prev = 'x'; continue; }
      }
      if (ch === '`') { flush(); readTemplate(); prev = 'x'; continue; }
      if (ch === '/' && (/[=(,:[!&|?{;]|^$/.test(prev) || /return$/.test(run.trimEnd()))) { flush(); readRegex(); prev = 'x'; continue; }
      if (ch === '{') { flush(); depth++; i++; prev = '{'; continue; }
      if (ch === '}') {
        flush();
        if (depth === 0 && untilBrace) { i++; return; }
        depth--; i++; prev = '}'; continue;
      }
      if (ch === '<' || ch === '>') { flush(); i++; prev = ch === '>' ? '' : '<'; continue; }
      run += ch;
      if (!/\s/.test(ch)) prev = ch;
      i++;
    }
    flush();
  }
  readCode(false);
  return out;
}

/** Tách một mẩu chữ thành các đoạn có chữ Việt, cắt ở chỗ biến ({} hoặc {tên}). */
export function fragments(text) {
  return text.split(/\{\w*\}/).map((x) => x.trim()).filter((x) => VI.test(x));
}
