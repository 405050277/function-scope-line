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
 * 从光标位置向上扫描，找到包围光标的最内层 {
 */
function enclosingOpen(
    doc: vscode.TextDocument,
    line: number,
    ch: number
): vscode.Position | null {
    let depth = 0;
    for (let l = line; l >= 0; l--) {
        const txt = doc.lineAt(l).text;
        const end = l === line ? ch : txt.length;
        for (let c = end - 1; c >= 0; c--) {
            if (txt[c] === '}') { depth++; }
            else if (txt[c] === '{') {
                if (depth === 0) return new vscode.Position(l, c);
                depth--;
            }
        }
    }
    return null;
}

/**
 * 找到 { 对应的 }
 */
function matchingClose(
    doc: vscode.TextDocument,
    open: vscode.Position
): vscode.Position | null {
    let depth = 0;
    for (let l = open.line; l < doc.lineCount; l++) {
        const txt = doc.lineAt(l).text;
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
 * 从 { 所在行向上，通过追踪括号深度找到函数/块签名起始行。
 * 原理：函数参数列表中最后的 ) 对应最前面的 (，当 ( 使深度归零时，
 * 说明找到了函数名所在行（即参数列表开始的那行）。
 */
function sigStart(doc: vscode.TextDocument, openLine: number): number {
    let pd = 0;
    for (let l = openLine; l >= Math.max(0, openLine - 60); l--) {
        const txt = doc.lineAt(l).text;
        // { 所在行只扫描 { 之前的内容
        let end = txt.length - 1;
        if (l === openLine) {
            const bi = txt.lastIndexOf('{');
            if (bi >= 0) end = bi - 1;
        }
        for (let c = end; c >= 0; c--) {
            if (txt[c] === ')') { pd++; }
            else if (txt[c] === '(') {
                pd--;
                if (pd <= 0) return l; // 找到了签名中最外层的 (，这行就是签名起始
            }
        }
    }
    return openLine;
}

/**
 * 向下扫描找到第一个 {（用于光标在签名行时）
 */
function nextOpen(doc: vscode.TextDocument, fromLine: number): vscode.Position | null {
    for (let l = fromLine; l < Math.min(doc.lineCount, fromLine + 30); l++) {
        const idx = doc.lineAt(l).text.indexOf('{');
        if (idx >= 0) return new vscode.Position(l, idx);
    }
    return null;
}

/**
 * 计算当前光标所在函数/块的完整范围 [签名起始行, 结束位置]
 */
function getRange(
    doc: vscode.TextDocument,
    cursorLine: number,
    cursorCh: number
): [number, vscode.Position] | null {
    // 方案一：向上找包围光标的 {（光标在函数体内时）
    const openB = enclosingOpen(doc, cursorLine, cursorCh);
    if (openB) {
        const sig = sigStart(doc, openB.line);
        if (sig <= cursorLine) {
            const close = matchingClose(doc, openB);
            if (close) return [sig, close];
        }
    }

    // 方案二：向下找 {（光标在签名行上时）
    const openF = nextOpen(doc, cursorLine);
    if (openF) {
        const sig = sigStart(doc, openF.line);
        if (sig <= cursorLine) {
            const close = matchingClose(doc, openF);
            if (close) return [sig, close];
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
