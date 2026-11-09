# AGENTS.md — 给 AI 的操作说明

> 你不需要调用接口。这个站点的内容就是几个文件夹里的 Markdown 文件，**直接读写文件即可**。
>
> 下面所有路径都相对于项目根目录（`content/` 与 `server.js` 同级）。

## 一句话

```
content\
├─ entries\   一条问题一个 .md
├─ topics\    一个知识主题一个 .md
├─ practice\  一道练习一个 .md
├─ site.json  个人资料
└─ .state\    复习进度（程序维护，不要动）
```

改完保存，网页会自动刷新。删除文件 = 删除记录。

## 三条硬规则

1. **一个文件 = 一条记录**，不要往同一个文件里塞两条。
2. **只写用户真实问过的问题**，不要编造；某段没有内容就整段省略，不要写「无」。
3. **不要碰 `content\.state\`**，那是复习进度和作答记录。

## 条目格式

文件名用英文小写 + 短横线，例如 `2026-11-09-null-compare.md`。
中文文件名也能用，但英文更稳（跨系统、跨工具）。

```markdown
---
title: SQL 里用 = NULL 判断空值永远不成立
type: bug
topic: 数据库
tags: [sql, null]
difficulty: 1
status: learning
---

# SQL 里用 = NULL 判断空值永远不成立

## 原始问题

为什么 WHERE email = NULL 查不到数据？

## 当时的思路

以为 NULL 就是一个普通的值，所以用等号比较。

## 错因

NULL 表示未知，与 NULL 的比较结果是 UNKNOWN，而 WHERE 只保留 TRUE 的行。

## 解法

使用 IS NULL / IS NOT NULL。

## 心法

NULL 不是值，是「未知」。

## 原始代码

```sql
SELECT * FROM users WHERE email = NULL;
```

## 修正后

```sql
SELECT * FROM users WHERE email IS NULL;
```
```

### frontmatter 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 一句话标题，具体到能一眼想起。也可以用正文第一行的 `# 标题` 代替 |
| `type` | 是 | `bug` 代码跑错 / `misconception` 思路错 / `gap` 知识空白 / `concept` 概念巩固 |
| `topic` | 是 | 简短学科名，如「概率与统计」「算法与数据结构」；新的主题会自动出现在知识地图里 |
| `tags` | 否 | `[python, 作用域]` |
| `difficulty` | 否 | 1–5，默认 2 |
| `status` | 否 | `new` / `learning` / `mastered`，默认 `new` |
| `occurrences` | 否 | 同一个坑踩过几次，默认 1 |
| `language` | 否 | `python` / `javascript` / `sql`，会影响代码块高亮 |
| `source` | 否 | 来源，如「ChatGPT 对话 2026-11-09」 |
| `created_at` | 否 | ISO 时间；不写就用文件创建时间 |

### 正文字段（`##` 标题是固定的，可省略）

| 标题 | 写什么 |
| --- | --- |
| `## 原始问题` | 用户当时的原话或疑问 |
| `## 当时的思路` | 他当时**错误地**以为是什么（这条最有复习价值） |
| `## 错因` | 机制层面的真正原因，不是现象复述 |
| `## 解法` | 正确做法与关键结论 |
| `## 心法` | 一句话：下次遇到该先想到什么 |
| `## 原始代码` / `## 修正后` | 放在代码块里，语言写在 ``` 后面 |

标题的别名也认：`问题` / `思路` / `原因` / `正确解法` / `takeaway` 等，但建议用上面的标准写法。

## 主题总结（可选，但强烈建议）

`content\topics\概率与统计.md`：

```markdown
---
name: 概率与统计
color: "#7c3aed"
---

## 总结

这个主题下我反复卡在什么地方（一两句话，说规律不说细节）。

## 要点

- 一句话要点
- 一句话要点

## 常见坑

- 一句话坑
```

文件名就是主题名，`name` 与文件名保持一致。

## 配套练习（可选）

`content\practice\bayes-1.md`：

```markdown
---
topic: 概率与统计
kind: math
difficulty: 3
entry: 2026-11-09-null-compare
---

## 题目

题干。

## 提示

一句提示，不要直接给答案。

## 答案

完整解析，说明每一步为什么，不要只给结果。
```

`kind` 取 `code` 或 `math`；`entry` 填条目的**文件名**（不带 `.md`），这样答题记录会同步到那条目的复习进度。

## 写完之后

1. 打开 <http://127.0.0.1:4321> 看是否出现；
2. 页面顶部如果出现红色「有 N 个文件没读懂」，按提示改格式；
3. 想看统计：`GET http://127.0.0.1:4321/api/stats`。

## 常见格式错误

| 现象 | 原因 |
| --- | --- |
| 「缺少 title」 | frontmatter 里没有 `title`，正文也没有 `# 标题` |
| 条目没出现 | `---` 没有成对闭合；或文件不在 `entries\` 目录下；或扩展名不是 `.md` |
| 代码显示不对 | 代码块 ``` 没有闭合，或语言名写错 |
| 修改被覆盖 | 文件名与已有条目重复了，一个文件只能放一条 |

## 如果你只能输出文字

把整段 Markdown 原样给用户，让他粘贴到网页「AI 接入 → 4 · 粘贴 Markdown 直接入库」，一样会存成记录。

## 附录：接口（可选）

只有在写文件不可行时才用，写操作需要 `config.json` 里的 token。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/snapshot` | 全部数据 |
| POST | `/api/entries` | 新建条目（JSON） |
| POST | `/api/entries/raw` | 传 `{markdown}` 直接入库 |
| PATCH | `/api/entries/:id` | 局部更新 |
| POST | `/api/import` | 批量 `{entries, topics, practice}` |
| GET | `/api/stats` | 统计与薄弱点 |
| POST | `/api/reload` | 重新扫描 content 目录 |
| GET | `/api` | 完整契约 |

> 注意：通过接口写入的内容也会落成同样的 `.md` 文件，两种方式可以混用。
