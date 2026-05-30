# 更新日志

## [1.0.1] - 2026-05-30

### 修复

- 修复光标在变量声明语句（如 `std::lock_guard<std::mutex> x(arg);`）上时，错误地触发函数范围线高亮并跨越到下一个函数的问题
- 以分号 `;` 结尾的行现在被正确识别为语句而非函数签名，不再触发范围线

## [1.0.0] - 2026-05-01

### 初始发布

- 在光标所在函数/块左侧显示完整垂直范围线，覆盖函数签名到结尾 `}`
- 支持多行参数声明（签名每一行均纳入范围）
- 支持 `template<>`、`inline`、`static`、`virtual`、`constexpr` 等前缀行
- 通过 `sanitizeLine` 过滤字符串字面量、正则字面量和注释中的括号，避免误判
- 一键选中整个函数快捷键 `Ctrl+Alt+C`
- 自定义范围线颜色（`functionScopeLine.color`）和宽度（`functionScopeLine.lineWidth`）
- 支持所有使用 `{}` 大括号的语言：C、C++、Java、JavaScript、TypeScript、C#、Go、Rust 等
