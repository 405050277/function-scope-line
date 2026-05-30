# 函数范围线 (Function Scope Line)

在光标所在函数/块的**左侧**显示一条完整的垂直范围线。

VS Code 内置的括号指引线只从 `{` 开始画线，**函数名和参数列表那几行是没有线的**。这个插件补上了这段空白，让你一眼就能看清当前光标在哪个函数里，范围从函数名一直画到结尾的 `}`。

---

## 功能

- **自动高亮当前函数**：光标移动时，自动在当前函数/块左侧显示一条垂直范围线，从函数签名第一行一直延伸到结尾 `}`
- **支持多行参数声明**：函数参数分多行写时，签名的每一行都纳入范围线
- **一键选中整个函数**：按 `Ctrl+Alt+C`，自动选中光标所在函数的全部内容（含签名

---

## 与 VS Code 内置功能的区别

```plaintext
// VS Code 内置括号指引线：从 { 开始
function myFunction(     ← 没有线
    param1,              ← 没有线
    param2               ← 没有线
) {                      ← 线从这里才开始
    // ...               |
}                        |

// 本插件：从函数名开始
function myFunction(     ← 线从这里开始
    param1,              |
    param2               |
) {                      |
    // ...               |
}                        |
```

---

## 设置

打开 VS Code 设置（`Ctrl+,`），搜索 **函数范围线** 或 **functionScopeLine**，可以修改以下选项：

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| `functionScopeLine.color` | 范围线的颜色，支持任意 CSS 颜色值，例如 `#FF8C00`、`rgba(255,140,0,0.8)`。**留空则自动使用当前主题的括号高亮颜色** | 留空（跟随主题） |
| `functionScopeLine.lineWidth` | 范围线的宽度，单位为像素 | `1.5` |

### 修改颜色示例

在 `settings.json` 里加入：

```json
"functionScopeLine.color": "#FF8C00",
"functionScopeLine.lineWidth": 2
```

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+Alt+S` | 选中光标所在的整个函数/块（含签名） |

---

## 支持的语言

任何使用 `{` `}` 大括号的语言，包括：C、C++、Java、JavaScript、TypeScript、C#、Go、Rust、PHP 等。
