'use strict';

/**
 * 示例数据：覆盖代码 bug / 错误思路 / 知识薄弱点 / 概念四类，
 * 让站点首次打开就有内容可看。用户可以一键清空。
 */

const DAY = 86400000;
const iso = (d) => d.toISOString();
const ago = (days, hour = 10) => {
  const d = new Date(Date.now() - days * DAY);
  d.setHours(hour, 0, 0, 0);
  return iso(d);
};
const ahead = (days) => iso(new Date(Date.now() + days * DAY));

const TOPICS = [
  {
    id: 't_python',
    name: 'Python 基础',
    color: '#3776ab',
    summary:
      '问题集中在「对象与作用域」：默认参数、可变对象、闭包晚绑定。这些不是语法难点，而是「什么时候创建、谁和谁共享」的运行时直觉。',
    key_points: [
      '默认参数在函数定义时求值一次，所有调用共享同一对象',
      '可变对象（list/dict/set）作为默认值是高危信号',
      '函数是对象，闭包捕获的是变量而不是值',
    ],
    pitfalls: ['用 [] 或 {} 当默认值', '以为每次调用都会重新创建默认对象'],
  },
  {
    id: 't_js',
    name: 'JavaScript 基础',
    color: '#d4a017',
    summary:
      '两块硬骨头：var 的函数作用域与闭包晚绑定、把 Promise 当成同步代码。共同点是「你以为的时序不是实际时序」。',
    key_points: [
      'var 是函数作用域，let/const 是块级作用域',
      'forEach 不等待 async 回调，for...of 才会等 await',
      '回调执行时读取的是变量的当前值，不是注册时的值',
    ],
    pitfalls: ['在 for(var) 里创建闭包', '在 forEach 里 await 然后以为会串行'],
  },
  {
    id: 't_prob',
    name: '概率与统计',
    color: '#7c3aed',
    summary:
      '最典型的方向性错误：把 P(证据|假设) 当成 P(假设|证据)。根子在没有先验概率意识，以及不习惯用「十万人的表格」把抽象条件概率具体化。',
    key_points: [
      'P(A|B) ≠ P(B|A)，条件的方向决定一切',
      '贝叶斯 = 先验 × 似然 → 后验，先验弱时证据再强也翻不过来',
      '频率派表格法（假设 10 万人）比公式更不容易错',
    ],
    pitfalls: ['忽略基础发生率', '把灵敏度当阳性预测值', '忘记假阳性也会堆积'],
  },
  {
    id: 't_linalg',
    name: '线性代数',
    color: '#0f766e',
    summary:
      '会算不会解释：能解 det(A-λI)=0，但说不清特征值的几何含义。缺的是「矩阵 = 空间变换」这个视角。',
    key_points: [
      '矩阵是线性变换，不是数字表格',
      '特征向量 = 变换后方向不变的方向，特征值 = 该方向的伸缩倍数',
      '行列式 = 体积缩放比；det=0 表示降维、不可逆',
    ],
    pitfalls: ['只背计算步骤，不给几何解释', '把特征向量和普通基向量混淆'],
  },
  {
    id: 't_algo',
    name: '算法与数据结构',
    color: '#b45309',
    summary:
      '两类问题：递归不画调用树导致低估复杂度；动态规划不从子问题出发，直接套模板。都是「先动手写，后想清楚」的习惯造成的。',
    key_points: [
      '递归先画调用树、数节点，再谈复杂度',
      '朴素递归的重复子问题是指数复杂度的根源',
      'dp 数组的含义必须能用一句话说清，说不清就是没想明白',
    ],
    pitfalls: ['以为递归每个状态只算一次', '先写循环再补状态定义', '边界条件靠试'],
  },
  {
    id: 't_db',
    name: '数据库',
    color: '#0369a1',
    summary: 'SQL 的三值逻辑：NULL 不是值，是「未知」。比较结果可能是 UNKNOWN，而 WHERE 只保留 TRUE。',
    key_points: ['NULL = 未知，NULL = NULL 结果是 UNKNOWN', '判断空值只能用 IS NULL / IS NOT NULL', '聚合函数大多会忽略 NULL'],
    pitfalls: ['用 != 排除空值', '用 = NULL 判断'],
  },
  {
    id: 't_css',
    name: '前端布局',
    color: '#be185d',
    summary: 'Flex 的隐式最小尺寸：flex item 默认 min-width:auto，不会小于内容宽度，于是长文本撑爆容器。',
    key_points: ['flex item 默认 min-width: auto', '需要收缩时显式 min-width: 0', '文本溢出要配合 overflow 与 text-overflow'],
    pitfalls: ['overflow: hidden 加错层', '用固定宽度硬压'],
  },
  {
    id: 't_calc',
    name: '微积分',
    color: '#1d4ed8',
    summary: '记号混淆：把 dy/dx 当成分数约分。链式法则的正确理解是复合函数求导，不是「dx 约掉」。',
    key_points: ['dy/dx 是整体记号，不是 dy 除以 dx', '链式法则：外层导数 × 内层导数', '先写清复合结构再求导'],
    pitfalls: ['约分 dx', '漏乘内层导数'],
  },
];

const ENTRIES = [
  {
    id: 'e_py_default',
    external_id: 'seed-py-default-arg',
    title: 'Python 默认参数只在定义时求值一次',
    type: 'bug',
    topic: 'Python 基础',
    tags: ['python', '函数', '可变对象'],
    difficulty: 2,
    status: 'learning',
    occurrences: 2,
    question: '写了一个往列表里追加元素的函数，第二次调用时列表里还留着上次的元素。每次都是新调用，为什么会串味？',
    my_attempt: '先怀疑是全局变量污染，把列表改成函数内部新建就正常了，但没搞懂默认参数为什么会这样。',
    root_cause:
      'def f(x, acc=[]) 里的 [] 在函数定义时只创建一次，之后所有调用共享同一个 list 对象。默认值不是「每次调用重新算」，而是「定义时算一次，之后一直用」。',
    solution: '默认值用 None 占位，函数体内判断后再创建；或者干脆要求调用方显式传入。',
    language: 'python',
    code_before: 'def collect(x, acc=[]):\n    acc.append(x)\n    return acc\n\nprint(collect(1))  # [1]\nprint(collect(2))  # [1, 2]  ← 期望 [2]',
    code_after: 'def collect(x, acc=None):\n    if acc is None:\n        acc = []\n    acc.append(x)\n    return acc\n\nprint(collect(1))  # [1]\nprint(collect(2))  # [2]',
    takeaway: '看到「默认值」先问：它在什么时候求值？共享的还是新建的？',
    source: 'ChatGPT 对话 2026-10-28',
    created_at: ago(12, 9),
    updated_at: ago(3, 21),
  },
  {
    id: 'e_js_var',
    external_id: 'seed-js-var-closure',
    title: 'for 循环里用 var，所有回调都打印同一个 i',
    type: 'bug',
    topic: 'JavaScript 基础',
    tags: ['javascript', '闭包', '作用域'],
    difficulty: 2,
    status: 'learning',
    occurrences: 1,
    question: '三个按钮绑点击事件，点哪个都打印 3，预期是 0/1/2。',
    my_attempt: '以为是事件绑定顺序问题，试过用 setTimeout 包一层，结果还是三个 3，更迷惑了。',
    root_cause: 'var 是函数作用域，不是块级作用域。循环体里所有回调捕获的是同一个 i，循环结束后它就是 3。',
    solution: '用 let 让每轮循环创建独立绑定；老代码里也可以用 IIFE 手动捕获当前值。',
    language: 'javascript',
    code_before:
      'for (var i = 0; i < 3; i++) {\n  buttons[i].onclick = () => console.log(i);\n}\n// 点任何一个都是 3',
    code_after:
      'for (let i = 0; i < 3; i++) {\n  buttons[i].onclick = () => console.log(i);\n}\n// 0 / 1 / 2',
    takeaway: 'var 是函数作用域，let 才是块级作用域；闭包捕获变量，不捕获值。',
    source: 'ChatGPT 对话 2026-11-02',
    created_at: ago(7, 14),
    updated_at: ago(2, 10),
  },
  {
    id: 'e_prob_bayes',
    external_id: 'seed-prob-bayes-direction',
    title: '把 P(患病|阳性) 和 P(阳性|患病) 当成同一件事',
    type: 'misconception',
    topic: '概率与统计',
    tags: ['概率', '贝叶斯', '条件概率'],
    difficulty: 3,
    status: 'learning',
    occurrences: 3,
    question: '一种病检测准确率 99%，我测出阳性，是不是有 99% 的概率得病？',
    my_attempt: '直接回答 99%，完全没考虑这个病本身有多罕见，也没考虑健康人被误判的情况。',
    root_cause:
      '条件概率的方向被搞反了。99% 是 P(阳性|患病)（灵敏度），而想知道的是 P(患病|阳性)。两者之间隔着先验概率，必须用贝叶斯换算。',
    solution:
      '用「十万人表格」具体化：患病率 0.1% → 100 人得病，其中 99 人阳性；99900 人健康，其中 1% 误判 → 999 人阳性。阳性者里真正得病的比例 = 99/(99+999) ≈ 9%。',
    language: 'python',
    code_before: '# 直觉（错）：阳性 → 99% 得病\np = 0.99',
    code_after:
      'prev, sens, spec = 0.001, 0.99, 0.99\np_pos_given_sick = sens\np_pos_given_healthy = 1 - spec\np_pos = prev * sens + (1 - prev) * p_pos_given_healthy\np_sick_given_pos = prev * sens / p_pos   # ≈ 0.0902',
    takeaway: '条件概率先问一句：谁是条件，谁是结论？再问先验是多少。',
    source: '概率论作业 + ChatGPT 追问',
    created_at: ago(20, 20),
    updated_at: ago(1, 16),
  },
  {
    id: 'e_linalg_eigen',
    external_id: 'seed-linalg-eigen-intuition',
    title: '会算特征值，但说不清它到底描述什么',
    type: 'gap',
    topic: '线性代数',
    tags: ['特征值', '线性变换', '几何直觉'],
    difficulty: 4,
    status: 'new',
    occurrences: 1,
    question: 'det(A - λI) = 0 我会解，题目也能做对，但被问「特征值的几何意义是什么」就卡住了。',
    my_attempt: '背了定义和计算流程，做题靠套公式，从来没画过图。',
    root_cause: '把矩阵当成数字表格，而不是「对空间做的一次变换」。没有几何图像，定义就只是符号。',
    solution:
      '把 A 看成把平面上的向量搬到别处的操作。大多数向量会被转方向，但总有一些特殊方向只被拉长/压短——这些方向是特征向量，伸缩倍数就是特征值。负特征值表示方向翻转。',
    language: '',
    code_before: '',
    code_after: '',
    takeaway: '矩阵 = 空间变换；特征向量 = 不被转走的方向；特征值 = 那个方向的伸缩倍数。',
    source: '线代复习时的自问',
    created_at: ago(5, 22),
    updated_at: ago(5, 22),
  },
  {
    id: 'e_sql_null',
    external_id: 'seed-sql-null',
    title: 'WHERE status != \'done\' 查不出 NULL 的行',
    type: 'bug',
    topic: '数据库',
    tags: ['sql', 'null', '三值逻辑'],
    difficulty: 1,
    status: 'learning',
    occurrences: 2,
    question: '表里有些行 status 是空的，想筛出「没完成」的，结果这些行一条都没出来。',
    my_attempt: '以为 NULL 等于空字符串，还试过 != \'\' ，同样不行。',
    root_cause:
      'NULL 表示「未知」，不是某个值。任何与 NULL 的比较结果都是 UNKNOWN，而 WHERE 只保留结果为 TRUE 的行。所以 status != \'done\' 对 NULL 行既不是真也不是假，直接被丢掉。',
    solution: '显式处理空值：WHERE status IS NULL OR status != \'done\'；或者用 COALESCE(status, \'\')。',
    language: 'sql',
    code_before: "SELECT * FROM tasks WHERE status != 'done';\n-- status 为 NULL 的行全部消失",
    code_after: "SELECT * FROM tasks\nWHERE status IS NULL OR status != 'done';",
    takeaway: 'NULL 不是值，是「未知」；判断空值只能用 IS NULL。',
    source: 'ChatGPT 对话 2026-09-30',
    created_at: ago(30, 11),
    updated_at: ago(9, 15),
  },
  {
    id: 'e_algo_fib',
    external_id: 'seed-algo-fib-complexity',
    title: '斐波那契递归为什么 n=40 就跑不动了',
    type: 'misconception',
    topic: '算法与数据结构',
    tags: ['递归', '复杂度', '记忆化'],
    difficulty: 3,
    status: 'learning',
    occurrences: 2,
    question: '递归版斐波那契看起来只做了 n 次加法，为什么 n=40 就要等很久？',
    my_attempt: '以为递归树里每个 n 只会被算一次，所以复杂度是 O(n)。',
    root_cause:
      '朴素递归把同一个子问题重复计算了指数次：fib(40) 会反复求 fib(38)、fib(37)……调用树节点数约 2^n，而不是 n。',
    solution: '记忆化（缓存已算过的 n）或改写成自底向上的迭代，复杂度降到 O(n)。',
    language: 'python',
    code_before: 'def fib(n):\n    if n < 2:\n        return n\n    return fib(n - 1) + fib(n - 2)\n# fib(40) ≈ 1.6 亿次调用',
    code_after:
      'from functools import lru_cache\n\n@lru_cache(maxsize=None)\ndef fib(n):\n    if n < 2:\n        return n\n    return fib(n - 1) + fib(n - 2)',
    takeaway: '递归先画调用树、数节点，再谈复杂度；有重复子问题就上缓存。',
    source: '算法课 + ChatGPT',
    created_at: ago(16, 19),
    updated_at: ago(4, 12),
  },
  {
    id: 'e_algo_dp',
    external_id: 'seed-algo-dp-state',
    title: '动态规划：不知道 dp[i] 该表示什么',
    type: 'gap',
    topic: '算法与数据结构',
    tags: ['动态规划', '状态设计'],
    difficulty: 4,
    status: 'new',
    occurrences: 1,
    question: '看题解能看懂，自己写就卡在第一步：dp 数组到底该定义成什么？',
    my_attempt: '习惯先写循环再补状态含义，结果越写越乱，最后只能照抄题解。',
    root_cause: '跳过了「定义子问题」这一步。dp 的本质是用一句话说清 dp[i] 的含义，说不清就说明还没想明白。',
    solution:
      '固定三步：① 用一句话定义 dp[i]；② 找最后一个决策，写出转移方程；③ 定边界和遍历顺序。先写注释再写代码。',
    language: 'python',
    code_before: '# 直接开始写循环，dp 的含义边写边猜\nfor i in range(n):\n    ...',
    code_after:
      '# dp[i] = 爬到第 i 阶的方法数\n# 最后一步要么跨 1 阶，要么跨 2 阶\ndp = [0] * (n + 1)\ndp[0], dp[1] = 1, 1\nfor i in range(2, n + 1):\n    dp[i] = dp[i - 1] + dp[i - 2]',
    takeaway: 'dp 数组的含义必须能用一句话说清楚，说不清就还没想明白。',
    source: '刷题卡点记录',
    created_at: ago(3, 23),
    updated_at: ago(3, 23),
  },
  {
    id: 'e_css_flex',
    external_id: 'seed-css-flex-minwidth',
    title: 'flex 子元素里的长文本会把容器撑爆',
    type: 'bug',
    topic: '前端布局',
    tags: ['css', 'flex', '溢出'],
    difficulty: 2,
    status: 'learning',
    occurrences: 1,
    question: '侧边栏用了 flex，里面一段长 URL 把整个布局撑出屏幕，加了 overflow: hidden 也没用。',
    my_attempt: '不断给父元素加 width: 100%、max-width，越改越乱。',
    root_cause:
      'flex item 的默认 min-width 是 auto，意味着它不会收缩到比内容更窄。所以内容多长，它就多宽，父容器被顶开。',
    solution: '给需要收缩的子项显式 min-width: 0（或 overflow: hidden），文本再加省略号。',
    language: 'css',
    code_before: '.row { display: flex; }\n.title { overflow: hidden; }\n/* 仍然溢出 */',
    code_after: '.row { display: flex; }\n.title {\n  min-width: 0;          /* 关键 */\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}',
    takeaway: 'flex 里出现溢出，第一反应是给子项加 min-width: 0。',
    source: 'ChatGPT 对话 2026-10-15',
    created_at: ago(25, 16),
    updated_at: ago(11, 9),
  },
  {
    id: 'e_calc_chain',
    external_id: 'seed-calc-chain-rule',
    title: '把 dy/dx 当成分数约分，链式法则就错了',
    type: 'misconception',
    topic: '微积分',
    tags: ['导数', '链式法则', '记号'],
    difficulty: 2,
    status: 'mastered',
    occurrences: 1,
    question: '做复合函数求导时，直接把 dy/dx 里的 dx 约掉，结果和答案差一个因子。',
    my_attempt: '把 dy/dx 当成真正的分数，看到 dx 就约分。',
    root_cause: 'dy/dx 是导数的整体记号，不是两个数相除。链式法则里「约分」只是记忆技巧，真正的依据是复合函数求导。',
    solution: '先写清复合结构 y = f(g(x))，再套 y\' = f\'(g(x)) · g\'(x)，每一步都标明是对谁求导。',
    language: '',
    code_before: 'y = sin(x^2)\ndy/dx = cos(x^2)   ← 漏了内层导数',
    code_after: "y = sin(u), u = x^2\ndy/dx = cos(u) · 2x = 2x·cos(x^2)",
    takeaway: 'd/dx 是算子不是分母；链式法则 = 外层导数 × 内层导数。',
    source: '高数错题本',
    created_at: ago(40, 21),
    updated_at: ago(6, 20),
    review: { last_at: ago(6, 20), next_at: ahead(14), interval: 14, ease: 2.6, streak: 3 },
  },
  {
    id: 'e_js_foreach',
    external_id: 'seed-js-foreach-async',
    title: 'await 放在 forEach 里不生效',
    type: 'bug',
    topic: 'JavaScript 基础',
    tags: ['javascript', 'async', 'promise'],
    difficulty: 2,
    status: 'learning',
    occurrences: 1,
    question: '在 forEach 里 await 请求，结果后面的代码先执行了，数据还没拿到。',
    my_attempt: '以为 await 会暂停整个 forEach，像 for 循环一样。',
    root_cause:
      'forEach 会同步地调用每个回调，然后立刻返回；它不会等待回调返回的 Promise。await 只暂停了当前这个回调，外层早就走了。',
    solution: '需要串行就用 for...of + await；可以并行就用 Promise.all(items.map(...))。',
    language: 'javascript',
    code_before: 'items.forEach(async (item) => {\n  await save(item);\n});\nconsole.log("done");  // 先打印',
    code_after: 'for (const item of items) {\n  await save(item);\n}\nconsole.log("done");\n\n// 或并行：\nawait Promise.all(items.map((item) => save(item)));',
    takeaway: 'forEach 不认 async；要等待就用 for...of 或 Promise.all。',
    source: 'ChatGPT 对话 2026-11-05',
    created_at: ago(2, 13),
    updated_at: ago(1, 9),
  },
];

const PRACTICE = [
  {
    id: 'p_py_sig',
    entry_id: 'e_py_default',
    topic: 'Python 基础',
    kind: 'code',
    difficulty: 2,
    prompt: '写一个函数 add_item(item, bucket=?) ，要求每次调用默认都从空列表开始，并且调用方仍可传入已有列表。给出函数签名和函数体。',
    hint: '默认值不能是可变对象。想想用什么占位，以及怎么判断。',
    answer:
      'def add_item(item, bucket=None):\n    if bucket is None:\n        bucket = []\n    bucket.append(item)\n    return bucket\n\n# 或者更函数式：\ndef add_item(item, bucket=None):\n    return [*(bucket or []), item]',
    status: 'todo',
    attempts: 0,
    correct: 0,
  },
  {
    id: 'p_prob_bayes',
    entry_id: 'e_prob_bayes',
    topic: '概率与统计',
    kind: 'math',
    difficulty: 3,
    prompt:
      '某病在人群中的患病率 0.1%。检测灵敏度 99%（有病检出阳性），特异度 95%（没病检出阴性）。某人阳性，他真正患病的概率约为多少？',
    hint: '假设 10 万人，先算真阳性和假阳性各多少人。',
    answer:
      '约 1.9%。\n10 万人：100 人患病 → 99 人真阳性；99900 人健康 → 5% 误判 ≈ 4995 人假阳性。\nP(患病|阳性) = 99 / (99 + 4995) ≈ 1.94%。\n先验极低时，再准的检测也会被假阳性淹没。',
    status: 'todo',
    attempts: 0,
    correct: 0,
  },
  {
    id: 'p_js_let',
    entry_id: 'e_js_var',
    topic: 'JavaScript 基础',
    kind: 'code',
    difficulty: 2,
    prompt: '下面的代码为什么三个回调都打印 3？改成打印 0、1、2，至少给出两种写法。',
    hint: '一种是换声明方式，一种是不换声明但手动制造作用域。',
    answer:
      '原因：var 是函数作用域，三个回调捕获同一个 i，循环结束时 i=3。\n\n写法一（推荐）：把 var 换成 let，每轮循环产生独立绑定。\nfor (let i = 0; i < 3; i++) { ... }\n\n写法二：IIFE 捕获当前值。\nfor (var i = 0; i < 3; i++) {\n  (function (j) { buttons[j].onclick = () => console.log(j); })(i);\n}',
    status: 'todo',
    attempts: 0,
    correct: 0,
  },
  {
    id: 'p_sql_null',
    entry_id: 'e_sql_null',
    topic: '数据库',
    kind: 'code',
    difficulty: 1,
    prompt: '表 users(id, email, verified)。写出「email 为空」的用户查询，再写出「email 不为空」的查询。',
    hint: '空值不能用 = 比较。',
    answer: '-- 为空\nSELECT * FROM users WHERE email IS NULL;\n\n-- 不为空\nSELECT * FROM users WHERE email IS NOT NULL;\n\n-- 若把空串也算空：\nSELECT * FROM users WHERE email IS NULL OR email = \'\';',
    status: 'todo',
    attempts: 0,
    correct: 0,
  },
  {
    id: 'p_algo_fib',
    entry_id: 'e_algo_fib',
    topic: '算法与数据结构',
    kind: 'code',
    difficulty: 3,
    prompt: '朴素递归 fib(n) 的时间复杂度是多少？为什么？写出把复杂度降到 O(n) 的两种方案。',
    hint: '画一下 fib(5) 的调用树，数数 fib(2) 被算了几次。',
    answer:
      'O(2^n)（更精确是 O(φ^n)，φ≈1.618）。因为每个节点分裂成两个子调用，大量子问题被重复计算，调用树节点数随 n 指数增长。\n\n方案一：记忆化，用 dict / lru_cache 缓存已算的 n。\n方案二：自底向上迭代，只保留前两项，空间 O(1)。',
    status: 'todo',
    attempts: 0,
    correct: 0,
  },
  {
    id: 'p_dp_stairs',
    entry_id: 'e_algo_dp',
    topic: '算法与数据结构',
    kind: 'code',
    difficulty: 3,
    prompt: '爬楼梯：每次可走 1 阶或 2 阶，求爬到第 n 阶的方法数。先用一句话写出 dp[i] 的含义，再写转移方程和边界。',
    hint: '从「最后一步」倒推。',
    answer:
      'dp[i] = 爬到第 i 阶的方法数。\n最后一步要么从 i-1 跨 1 阶，要么从 i-2 跨 2 阶：\ndp[i] = dp[i-1] + dp[i-2]\n边界：dp[0] = 1（原地算一种），dp[1] = 1。\n答案 dp[n]，时间 O(n)，空间可优化到 O(1)。',
    status: 'todo',
    attempts: 0,
    correct: 0,
  },
  {
    id: 'p_linalg_eigen',
    entry_id: 'e_linalg_eigen',
    topic: '线性代数',
    kind: 'math',
    difficulty: 4,
    prompt: 'A = [[2, 1], [1, 2]]。求特征值和特征向量，并用一句话解释它们在几何上意味着什么。',
    hint: '先解 det(A - λI) = 0，得到 λ；再代回 (A - λI)v = 0。',
    answer:
      'det(A-λI) = (2-λ)^2 - 1 = λ^2 - 4λ + 3 = (λ-1)(λ-3)，所以 λ1=3，λ2=1。\nλ=3：(A-3I)v=0 → v ∝ (1,1)。\nλ=1：(A-I)v=0 → v ∝ (1,-1)。\n几何意义：这个变换把 (1,1) 方向拉长 3 倍，把 (1,-1) 方向原样保留，其他方向的向量都会被转走。',
    status: 'todo',
    attempts: 0,
    correct: 0,
  },
  {
    id: 'p_css_flex',
    entry_id: 'e_css_flex',
    topic: '前端布局',
    kind: 'code',
    difficulty: 2,
    prompt: '一个 flex 行容器，左侧固定 200px 侧栏，右侧是标题（可能很长）。要求标题过长时显示省略号且不撑破布局，写出关键 CSS。',
    hint: 'flex item 的默认最小尺寸是内容宽度。',
    answer:
      '.row { display: flex; }\n.side { flex: 0 0 200px; }\n.title {\n  flex: 1 1 auto;\n  min-width: 0;        /* 关键：允许收缩到比内容窄 */\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}',
    status: 'todo',
    attempts: 0,
    correct: 0,
  },
  {
    id: 'p_calc_chain',
    entry_id: 'e_calc_chain',
    topic: '微积分',
    kind: 'math',
    difficulty: 2,
    prompt: '求 d/dx [ sin(x²) ] 和 d/dx [ e^(3x) · ln x ]。写出每一步用的是哪条法则。',
    hint: '先拆复合结构，再套链式法则和乘积法则。',
    answer:
      '① sin(x²)：外层 sin，内层 x²。\nd/dx = cos(x²) · 2x = 2x·cos(x²)\n\n② e^(3x)·ln x：乘积法则 (uv)\' = u\'v + uv\'，其中 (e^(3x))\' 用链式法则 = 3e^(3x)。\n= 3e^(3x)·ln x + e^(3x)·(1/x) = e^(3x)(3ln x + 1/x)',
    status: 'todo',
    attempts: 0,
    correct: 0,
  },
  {
    id: 'p_js_serial',
    entry_id: 'e_js_foreach',
    topic: 'JavaScript 基础',
    kind: 'code',
    difficulty: 2,
    prompt: '有 ids 数组，需要按顺序依次请求 /api/item/:id 并把结果收集起来，最后打印。写出正确写法，并说明为什么 forEach 不行。',
    hint: 'forEach 不等待回调返回的 Promise。',
    answer:
      'const results = [];\nfor (const id of ids) {\n  results.push(await fetchItem(id));\n}\nconsole.log(results);\n\n// 若不需要顺序，可并行：\nconst results = await Promise.all(ids.map(fetchItem));\n\nforEach 的问题：它同步调用每个回调后立即返回，回调里的 await 只暂停该回调自身，外层函数不会等待。',
    status: 'todo',
    attempts: 0,
    correct: 0,
  },
];

function makeSeed() {
  const now = new Date();
  const entries = ENTRIES.map((e) => {
    const review = e.review || {
      last_at: null,
      next_at: e.id === 'e_calc_chain' ? ahead(14) : iso(new Date(Date.now() - Math.random() * 2 * DAY)),
      interval: 1,
      ease: 2.5,
      streak: 0,
    };
    return { ...e, review, is_sample: true, created_at: e.created_at, updated_at: e.updated_at };
  });

  const events = [];
  for (const e of entries) {
    events.push({ at: e.created_at, type: 'entry_created', ref: e.id });
  }
  // 再补一些复习/练习动作，让热力图有起伏
  const extra = [0, 1, 1, 2, 2, 3, 3, 3, 4, 5, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28];
  extra.forEach((d, i) => {
    events.push({
      at: ago(d, 9 + (i % 10)),
      type: i % 3 === 0 ? 'attempt' : 'review',
      ref: entries[(i * 3) % entries.length].id,
    });
  });
  events.sort((a, b) => new Date(a.at) - new Date(b.at));

  return {
    version: 1,
    profile: {
      name: '同学',
      goal: '把问过 AI 的问题真正吃透，而不是收藏了就忘',
      daily_target: 3,
      created_at: iso(now),
    },
    topics: TOPICS.map((t) => ({ ...t, is_sample: true })),
    entries,
    practice: PRACTICE.map((p) => ({ ...p, is_sample: true })),
    events,
  };
}

module.exports = { makeSeed };
