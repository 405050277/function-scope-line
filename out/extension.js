"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
let deco;
let timer;
function buildDeco() {
    const cfg = vscode.workspace.getConfiguration('functionScopeLine');
    const color = cfg.get('color') || '';
    const width = cfg.get('lineWidth') ?? 1.5;
    const borderColor = color
        ? color
        : new vscode.ThemeColor('editorBracketHighlight.foreground1');
    if (deco)
        deco.dispose();
    deco = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        borderStyle: 'solid',
        borderColor,
        borderWidth: `0 0 0 ${width}px`,
    });
}
function activate(ctx) {
    buildDeco();
    ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('functionScopeLine')) {
            buildDeco();
            const ed = vscode.window.activeTextEditor;
            if (ed)
                update(ed);
        }
    }), vscode.window.onDidChangeTextEditorSelection(e => {
        if (timer)
            clearTimeout(timer);
        timer = setTimeout(() => update(e.textEditor), 60);
    }), vscode.window.onDidChangeActiveTextEditor(ed => {
        if (ed)
            update(ed);
    }), vscode.commands.registerCommand('functionRange.select', () => {
        const ed = vscode.window.activeTextEditor;
        if (ed)
            selectBlock(ed);
    }));
    if (vscode.window.activeTextEditor) {
        update(vscode.window.activeTextEditor);
    }
}
/**
 * 将一行代码中字符串字面量、正则字面量、单行注释的内容替换为空格，
 * 防止其中的 { } 被误计为括号。
 */
function sanitizeLine(text) {
    return text.replace(/(["'`])(?:\\[\s\S]|(?!\1)[^\\])*\1|\/\/.*|\/(?![/*])(?:\\.|[^/\\\n])+\//g, m => ' '.repeat(m.length));
}
/**
 * 从光标位置向上扫描，找到包围光标的最内层 {
 */
function enclosingOpen(doc, line, ch) {
    let depth = 0;
    for (let l = line; l >= 0; l--) {
        const txt = sanitizeLine(doc.lineAt(l).text);
        const end = l === line ? ch : txt.length;
        for (let c = end - 1; c >= 0; c--) {
            if (txt[c] === '}') {
                depth++;
            }
            else if (txt[c] === '{') {
                if (depth === 0)
                    return new vscode.Position(l, c);
                depth--;
            }
        }
    }
    return null;
}
/**
 * 找到 { 对应的 }
 */
function matchingClose(doc, open) {
    let depth = 0;
    for (let l = open.line; l < doc.lineCount; l++) {
        const txt = sanitizeLine(doc.lineAt(l).text);
        const start = l === open.line ? open.character : 0;
        for (let c = start; c < txt.length; c++) {
            if (txt[c] === '{') {
                depth++;
            }
            else if (txt[c] === '}') {
                depth--;
                if (depth === 0)
                    return new vscode.Position(l, c + 1);
            }
        }
    }
    return null;
}
/**
 * 从 { 所在行向上，通过追踪括号深度找到函数/块签名起始行。
 * 原理：函数参数列表中最后的 ) 对应最前面的 (，当 ( 使深度归零时，
 * 说明找到了函数名所在行（即参数列表开始的那行）。
 */
function sigStart(doc, openLine) {
    let pd = 0;
    for (let l = openLine; l >= Math.max(0, openLine - 60); l--) {
        const txt = doc.lineAt(l).text;
        // { 所在行只扫描 { 之前的内容
        let end = txt.length - 1;
        if (l === openLine) {
            const bi = txt.lastIndexOf('{');
            if (bi >= 0)
                end = bi - 1;
        }
        for (let c = end; c >= 0; c--) {
            if (txt[c] === ')') {
                pd++;
            }
            else if (txt[c] === '(') {
                pd--;
                if (pd <= 0)
                    return l; // 找到了签名中最外层的 (，这行就是签名起始
            }
        }
    }
    return openLine;
}
/**
 * 向下扫描找到第一个 {（用于光标在签名行时）
 */
function nextOpen(doc, fromLine) {
    for (let l = fromLine; l < Math.min(doc.lineCount, fromLine + 30); l++) {
        const idx = doc.lineAt(l).text.indexOf('{');
        if (idx >= 0)
            return new vscode.Position(l, idx);
    }
    return null;
}
/**
 * 计算当前光标所在函数/块的完整范围 [签名起始行, 结束位置]
 * 触发条件：光标行含有 ( 且不是控制流语句（只在函数/方法签名行触发）
 */
function getRange(doc, cursorLine, cursorCh) {
    const lineText = doc.lineAt(cursorLine).text.trimStart();
    // 不含 ( 的行直接跳过
    if (!lineText.includes('('))
        return null;
    // 注释行跳过
    if (/^(\/\/|\/\*|\*)/.test(lineText))
        return null;
    // 控制流语句跳过
    if (/^(if|else|for|while|do\b|switch|try|catch|finally)\b/.test(lineText)
        || /^\}\s*else\b/.test(lineText)) {
        return null;
    }
    // 以 ; 结尾的是普通语句（变量声明/函数调用），不是函数签名，跳过
    if (lineText.trimEnd().endsWith(';'))
        return null;
    // 光标行就是签名起始行，向上查找 template / 修饰行，扩展起始行
    const openF = nextOpen(doc, cursorLine);
    if (openF) {
        const close = matchingClose(doc, openF);
        if (close) {
            // 向上最多扫 5 行，把 template<...>、[[...]]、inline、static 等前缀行纳入
            let sigLine = cursorLine;
            for (let up = cursorLine - 1; up >= Math.max(0, cursorLine - 5); up--) {
                const upText = doc.lineAt(up).text.trim();
                if (!upText || /^[{};]/.test(upText))
                    break; // 空行或语句结束，停止
                if (/^(template\s*<|inline\b|static\b|virtual\b|explicit\b|constexpr\b|\[\[)/.test(upText)) {
                    sigLine = up;
                }
                else {
                    break;
                }
            }
            return [sigLine, close];
        }
    }
    return null;
}
function update(ed) {
    const cur = ed.selection.active;
    const result = getRange(ed.document, cur.line, cur.character);
    if (!result) {
        ed.setDecorations(deco, []);
        return;
    }
    const [sigLine, closePos] = result;
    ed.setDecorations(deco, [{
            range: new vscode.Range(sigLine, 0, closePos.line, 0),
        }]);
}
function selectBlock(ed) {
    const cur = ed.selection.active;
    const result = getRange(ed.document, cur.line, cur.character);
    if (!result)
        return;
    const [sigLine, closePos] = result;
    ed.selection = new vscode.Selection(new vscode.Position(sigLine, 0), closePos);
    ed.revealRange(new vscode.Range(new vscode.Position(sigLine, 0), closePos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map