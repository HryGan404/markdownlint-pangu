# markdownlint-pangu

`markdownlint-pangu` 是一个 Markdown 命令行工具。它把两件事放到同一个 CLI 里：

- 用 `markdownlint` 检查常见 Markdown 格式问题
- 用 `pangu` 检查和修复中英文之间缺少空格的问题

它会尽量只修改普通正文，避免误改代码块、行内代码、链接地址、HTML、数学公式等高风险内容。

## 安装

全局安装：

```bash
npm install -g markdownlint-pangu
```

安装后运行：

```bash
markdownlint-pangu --help
```

也可以不安装，直接用 `npx`：

```bash
npx markdownlint-pangu check README.md
```

## 快速开始

检查 Markdown 文件：

```bash
markdownlint-pangu check README.md
markdownlint-pangu check "docs/**/*.md"
```

修复 Markdown 文件：

```bash
markdownlint-pangu fix README.md
markdownlint-pangu fix "docs/**/*.md"
```

`fix` 会先尝试修复，然后重新检查。只有重新检查没有剩余诊断时，才会写回文件；如果仍有问题，会报告诊断，不写入部分修复结果。

## 常用命令

输出 JSON 诊断：

```bash
markdownlint-pangu check --format json README.md
```

只检查中英文空格，不运行 `markdownlint`：

```bash
markdownlint-pangu check --markdownlint-off README.md
```

只运行 `markdownlint`，不检查中英文空格：

```bash
markdownlint-pangu check --pangu-off README.md
```

从标准输入检查：

```bash
cat README.md | markdownlint-pangu check --stdin --stdin-filepath README.md
```

从标准输入修复：

```bash
cat README.md | markdownlint-pangu fix --stdin --stdin-filepath README.md > fixed.md
```

`--stdin-filepath` 是必需的，用来显示诊断位置，也让 `markdownlint` 能按文件路径匹配规则。

## markdownlint 规则

默认情况下，工具会读取当前目录下的 `.markdownlint.json`。也可以手动指定：

```bash
markdownlint-pangu check --config path/to/.markdownlint.json README.md
```

本工具默认忽略 `MD013/line-length`，也就是 markdownlint 的行长度限制。普通中文文档里长链接、长句、表格比较常见，默认关闭这个规则可以减少噪音。

如果你想重新启用行长度检查，可以在 `.markdownlint.json` 里配置 `MD013` / `line-length`，或用 `--rules` 显式选择它：

```bash
markdownlint-pangu check --pangu-off --rules MD013 README.md
```

只启用指定 markdownlint 规则：

```bash
markdownlint-pangu check --pangu-off --rules MD041,MD009 README.md
```

禁用指定 markdownlint 规则：

```bash
markdownlint-pangu check --pangu-off --disable MD009 README.md
```

`--rules` 和 `--disable` 都使用逗号分隔，写在同一个参数里。

## pangu 空格检查

pangu 功能默认开启，用来检查和修复中英文之间缺少空格的问题，例如：

```markdown
这是README文件
```

会被修复为：

```markdown
这是 README 文件
```

默认会处理这些 Markdown 文本区域：

- 段落
- 标题
- 列表项
- 引用块
- 表格单元格文本
- 链接文本
- 图片 alt 文本

默认不会处理这些区域：

- fenced code block
- inline code
- URL / link destination
- HTML
- front matter
- math block / inline math
- definition / footnote 等结构区

此外，工具会保守保留 `/` 周围原本的空格，也会保留中文成对标点外侧原本的空格，例如 `《》`、`（）`、`【】`、`「」`、`『』` 等。

### pangu 配置

默认会读取当前目录下的 `.markdownlint-pangu.json`。也可以手动指定：

```bash
markdownlint-pangu check --pangu-config path/to/.markdownlint-pangu.json README.md
```

配置示例：

```json
{
  "pangu": {
    "enabled": true,
    "ignorePatterns": ["ProductName"],
    "ignoreBlocks": ["DoNotTouchThisSentence"]
  }
}
```

- `enabled: false`：关闭 pangu 空格检查和修复
- `ignorePatterns`：跳过匹配到的片段，只处理同一段里的其他内容
- `ignoreBlocks`：如果一个安全文本块里包含匹配内容，跳过整个文本块

`ignorePatterns` 和 `ignoreBlocks` 当前都是普通字符串匹配，不是正则表达式。

## CLI 选项

`check` 和 `fix` 共享这些选项：

- `--config <path>`：指定 `markdownlint` 配置文件路径
- `--pangu-config <path>`：指定 `.markdownlint-pangu.json` 路径
- `--format <text|json>`：诊断输出格式，默认 `text`
- `--pangu-off`：关闭 pangu 空格检查或修复
- `--markdownlint-off`：关闭 markdownlint 检查或修复
- `--quiet`：不输出诊断信息
- `--stdin`：从标准输入读取 Markdown
- `--stdin-filepath <path>`：stdin 模式下用于诊断定位与规则匹配的路径
- `--rules <items>`：仅启用指定 markdownlint 规则，逗号分隔
- `--disable <items>`：禁用指定 markdownlint 规则，逗号分隔

查看完整帮助：

```bash
markdownlint-pangu --help
markdownlint-pangu check --help
markdownlint-pangu fix --help
```

## 输出与退出码

- `0`：没有剩余诊断
- `1`：存在诊断，或配置加载 / 运行过程出错
- `2`：CLI 参数使用错误

补充说明：

- `fix --stdin` 的 stdout 只输出修复后的正文
- `fix --stdin` 的诊断信息输出到 stderr，避免污染管道结果
- `--format json` 会输出统一诊断模型的 JSON 数组，适合脚本或 CI 使用

## 从源码开发

```bash
git clone https://github.com/HryGan404/markdownlint-pangu.git
cd markdownlint-pangu
npm install
npm run build
npm run test
```

本项目基于：

- `markdownlint`：[https://github.com/DavidAnson/markdownlint](https://github.com/DavidAnson/markdownlint)
- `pangu.js`：[https://github.com/vinta/pangu.js](https://github.com/vinta/pangu.js)
