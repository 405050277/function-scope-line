import * as vscode from 'vscode';

let deco: vscode.TextEditorDecorationType;
let timer: ReturnType<typeof setTimeout> | undefined;

function buildDeco() {
    const cfg = vscode.workspace.getConfiguration('functionScopeLine');
    const color = cfg.get<string>('color') || '';
    const width = cfg.get<number>('lineWidth') ?? 1.5;
    const borderColor: string | vscode.ThemeColor = color
        ? color
        : new vscode.ThemeColor('editorBracketHighlight.foreground1');
    if (deco) deco.dispose();
    deco = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        borderStyle: 'solid',
        borderColor,
        borderWidth: `0 0 0 ${width}px`,
    });
}

export function activate(ctx: vscode.ExtensionContext) {
    buildDeco();

    ctx.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('functionScopeLine')) {
                buildDeco();
                const ed = vscode.window.activeTextEditor;
                if (ed) update(ed);
            }
        }),
        vscode.window.onDidChangeTextEditorSelection(e => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => update(e.textEditor), 60);
        }),
        vscode.window.onDidChangeActiveTextEditor(ed => {
            if (ed) update(ed);
        }),
        vscode.commands.registerCommand('functionRange.select', () => {
            const ed = vscode.window.activeTextEditor;
            if (ed) selectBlock(ed);
        })
    );

    if (vscode.window.activeTextEditor) {
        update(vscode.window.activeTextEditor);
    }
}

/**
 * 将一行代码中字符串字面量、正则字面量、单行注释的内容替换为空格，
 * 防止其中的 { } 被误计为括号。
 */
function sanitizeLine(text: string, inBlockComment: boolean): { result: string; inBlockComment: boolean } {
    // 预处理器宏行（#define 等）整行视为空，其中括号不参与计数
    if (!inBlockComment && text.trimStart().startsWith('#')) {
        return { result: ' '.repeat(text.length), inBlockComment: false };
    }
    let out = '';
    let i = 0;
    while (i < text.length) {
        if (inBlockComment) {
            // 在多行注释中，找 */
            if (text[i] === '*' && text[i + 1] === '/') {
                out += '  ';
                i += 2;
                inBlockComment = false;
            } else {
                out += ' ';
                i++;
            }
        } else {
            // 单行注释 //：该行剩余全替换为空格
            if (text[i] === '/' && text[i + 1] === '/') {
                out += ' '.repeat(text.length - i);
                break;
            }
            // 多行注释开始 /*
            if (text[i] === '/' && text[i + 1] === '*') {
                out += '  ';
                i += 2;
                inBlockComment = true;
                continue;
            }
            // 字符串字面量 " ' `
            if (text[i] === '"' || text[i] === "'" || text[i] === '`') {
                const q = text[i];
                out += ' ';
                i++;
                while (i < text.length) {
                    if (text[i] === '\\') { out += '  '; i += 2; }
                    else if (text[i] === q) { out += ' '; i++; break; }
                    else { out += ' '; i++; }
                }
                continue;
            }
            out += text[i];
            i++;
        }
    }
    return { result: out, inBlockComment };
}

/**
 * 找到 { 对应的匹配 }，全程追踪多行注释状态
 */
function matchingClose(
    doc: vscode.TextDocument,
    open: vscode.Position
): vscode.Position | null {
    let depth = 0;
    let inBlockComment = false;
    // 先扫 open 行之前的内容，确定进入该行时的注释状态
    for (let l = 0; l < open.line; l++) {
        const { inBlockComment: next } = sanitizeLine(doc.lineAt(l).text, inBlockComment);
        inBlockComment = next;
    }
    for (let l = open.line; l < doc.lineCount; l++) {
        const raw = doc.lineAt(l).text;
        const { result: txt, inBlockComment: next } = sanitizeLine(raw, inBlockComment);
        inBlockComment = next;
        const start = l === open.line ? open.character : 0;
        for (let c = start; c < txt.length; c++) {
            if (txt[c] === '{') { depth++; }
            else if (txt[c] === '}') {
                depth--;
                if (depth === 0) return new vscode.Position(l, c + 1);
            }
        }
    }
    return null;
}

/**
 * 触发条件1：光标左侧去掉尾部空格后，以 ) { 或 ){ 结尾
 *   → 从该行的 { 向下找匹配 }，画线
 *
 * 触发条件2：光标左侧到行首全是空格（光标在行首），且光标右侧能找到 ) { 或 ){
 *   → 同样从该 { 向下找匹配 }，画线
 */
function getRange(
    doc: vscode.TextDocument,
    cursorLine: number,
    cursorCh: number
): [number, vscode.Position] | null {
    // 先确定到光标行为止的多行注释状态
    let inBC = false;
    for (let l = 0; l < cursorLine; l++) {
        const { inBlockComment } = sanitizeLine(doc.lineAt(l).text, inBC);
        inBC = inBlockComment;
    }
    const { result: line } = sanitizeLine(doc.lineAt(cursorLine).text, inBC);
    const leftText = line.substring(0, cursorCh);

    // 触发条件1：光标左侧以 ) { 或 ){ 结尾
    if (/\)\s*\{\s*$/.test(leftText)) {
        const braceIdx = leftText.lastIndexOf('{');
        const closePos = matchingClose(doc, new vscode.Position(cursorLine, braceIdx));
        if (closePos) return [cursorLine, closePos];
    }

    // 触发条件2：光标左侧全是空格，向右跨行搜索 ) { 或 ){
    // 起点为当前光标行，最多向下扫 60 行（覆盖超长参数列表）
    // 如果当前行是纯空行（什么代码都没有），不触发
    if (/^\s*$/.test(leftText) && doc.lineAt(cursorLine).text.trim().length > 0) {
        let bc = inBC;
        for (let l = cursorLine; l < Math.min(doc.lineCount, cursorLine + 60); l++) {
            const startC = l === cursorLine ? cursorCh : 0;
            const raw = doc.lineAt(l).text;
            const { result: sanitized, inBlockComment: nextBc } = sanitizeLine(raw, bc);
            const searchText = sanitized.substring(startC);
            const m = searchText.match(/\)\s*\{/);
            if (m && m.index !== undefined) {
                const braceIdx = startC + m.index + m[0].lastIndexOf('{');
                const closePos = matchingClose(doc, new vscode.Position(l, braceIdx));
                if (closePos) return [cursorLine, closePos];
            }
            // 若遇到以 ; 结尾的行（函数体内语句），停止向下搜索
            if (l > cursorLine && /;\s*$/.test(sanitized.trimEnd())) break;
            bc = nextBc;
        }
    }

    return null;
}

function update(ed: vscode.TextEditor) {
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

function selectBlock(ed: vscode.TextEditor) {
    const cur = ed.selection.active;
    const result = getRange(ed.document, cur.line, cur.character);
    if (!result) return;
    const [sigLine, closePos] = result;
    ed.selection = new vscode.Selection(
        new vscode.Position(sigLine, 0),
        closePos
    );
    ed.revealRange(
        new vscode.Range(new vscode.Position(sigLine, 0), closePos),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
}

export function deactivate() {}
