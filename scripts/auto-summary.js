/**
 * 每日对话自动归档脚本（模板）
 *
 * 功能：每天由系统计划任务触发
 *   1. 读取 opencode.db，提取今天本项目的对话内容
 *   2. 调用 GLM API 分析对话
 *   3. AI 判断是否有值得提炼的内容
 *   4. 有内容 → 写入 产出/每日总结/YYYY-MM/每日总结-YYYY-MM-DD.md（按月份子目录归档，当天文件追加）
 *      无内容 → 不建空文件
 *
 * 用法：
 *   node scripts/auto-summary.js              # 工作电脑（无后缀）
 *   node scripts\auto-summary.js --machine=home  # 家用电脑（文件加 -HOME 后缀）
 *   node scripts/auto-summary.js --date=2026-08-12  # 补跑指定日期
 *
 * ============================================================
 * 使用前必改（搜索 PROJECT_NAME 改成你的项目英文名）：
 *   1. CONFIG.projectKeyword 的值（用于匹配 opencode.db 里的 session directory）
 *   2. CONFIG.outputDir 的输出目录（默认 产出/每日总结/，按项目调整）
 *   3. CONFIG.logFile 里的 PROJECT_NAME（日志文件名）
 *   4. analyzeWithGLM 里 prompt 的项目名（"你是 PROJECT_NAME 项目的开发记录助手"）
 *   5. auto-summary.bat 里的 PROJECT_NAME（日志文件名）
 *   6. 确认 server/ 目录下装了 sql.js（npm install sql.js）
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

// sql.js 装在本项目 server 目录（如没有 server 目录，建一个并 npm install sql.js）
const serverDir = path.resolve(__dirname, '..', 'server');
const sqlJsPath = path.join(serverDir, 'node_modules', 'sql.js');
if (!fs.existsSync(sqlJsPath)) {
  console.error(`未找到 ${sqlJsPath}`);
  console.error('请先在 server 目录下执行 npm install sql.js，详见 scripts/README.md');
  process.exit(1);
}
const initSqlJs = require(sqlJsPath);

// ============ 配置 ============
const machineArg = process.argv.find(a => a.startsWith('--machine='));
const machineTag = machineArg ? machineArg.split('=')[1].trim() : '';
const dateArg = process.argv.find(a => a.startsWith('--date='));
const targetDate = dateArg ? dateArg.split('=')[1].trim() : null;

const CONFIG = {
  dbPath: path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db'),
  projectDir: path.resolve(__dirname, '..'),
  // 【必改】PROJECT_NAME 改成你的项目英文名，用于匹配 opencode.db 里的 session directory
  projectKeyword: 'PROJECT_NAME',
  apiURL: 'https://api.miaoyun.net.cn/v1/chat/completions',
  apiKey: 'sk-RwPT0lymEdjK6zdlD5A9F4293d334655B4524e7b98Aa61E9',
  model: 'glm-5.2',
  // 【必改】输出目录，默认 产出/每日总结/，按项目调整
  outputDir: path.resolve(__dirname, '..', '产出', '每日总结'),
  machineSuffix: machineTag ? `-${machineTag.toUpperCase()}` : '',
  logFile: path.join(os.tmpdir(), 'PROJECT_NAME_auto_summary.log'),
};

// ============ 日志 ============
function log(msg) {
  const now = new Date().toLocaleString('zh-CN');
  const line = `[${now}] ${msg}`;
  console.log(line);
  fs.appendFileSync(CONFIG.logFile, line + '\n');
}

// ============ 从 opencode.db 提取今天的对话 ============
async function extractTodayConversations() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(CONFIG.dbPath);
  const db = new SQL.Database(buf);

  const now = targetDate ? new Date(targetDate + 'T00:00:00') : new Date();
  const todayStr = targetDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const startOfDay = new Date(todayStr + 'T00:00:00').getTime();
  const endOfDay = new Date(todayStr + 'T23:59:59').getTime();

  log(`提取 ${todayStr} 的对话，时间范围 ${startOfDay} - ${endOfDay}`);

  const sessions = db.exec(`
    SELECT id, title, directory, time_created
    FROM session
    WHERE directory LIKE '%${CONFIG.projectKeyword}%'
    AND time_created >= ${startOfDay}
    AND time_created <= ${endOfDay}
    ORDER BY time_created ASC
  `);

  if (!sessions.length || !sessions[0].values.length) {
    log(`今天没有 ${CONFIG.projectKeyword} 相关的对话`);
    return { date: todayStr, conversations: [] };
  }

  const sessionRows = sessions[0].values;
  log(`找到 ${sessionRows.length} 个 session`);

  const conversations = [];
  for (const row of sessionRows) {
    const [sessionId, title, directory, timeCreated] = row;
    const messages = db.exec(`
      SELECT id, data FROM message WHERE session_id = '${sessionId}' ORDER BY time_created ASC
    `);

    if (!messages.length || !messages[0].values.length) continue;

    let conversationText = '';
    for (const msgRow of messages[0].values) {
      const [msgId, msgData] = msgRow;
      let role;
      try {
        const msg = JSON.parse(msgData);
        role = msg.role;
      } catch (e) { continue; }

      const parts = db.exec(
        `SELECT data FROM part WHERE message_id = '${msgId}' ORDER BY time_created ASC`
      );
      if (!parts.length || !parts[0].values.length) continue;

      const roleLabel = role === 'user' ? '用户' : 'AI';
      for (const partRow of parts[0].values) {
        try {
          const pd = JSON.parse(partRow[0]);
          if (pd.type === 'text' && pd.text) {
            conversationText += `${roleLabel}: ${pd.text}\n`;
          }
        } catch (e) {}
      }
    }

    if (conversationText) {
      conversations.push({
        sessionId,
        title: title || '无标题',
        text: conversationText
      });
    }
  }

  db.close();
  return { date: todayStr, conversations };
}

// ============ 调 GLM 分析对话 ============
function analyzeWithGLM(conversations, dateStr) {
  return new Promise((resolve, reject) => {
    const allText = conversations.map((c, i) => `--- 对话${i+1}: ${c.title} ---\n${c.text}`).join('\n\n');

    const prompt = {
      model: CONFIG.model,
      messages: [
        {
          role: 'system',
          content: `你是 PROJECT_NAME 项目的开发记录助手。请分析以下今天在本项目中发生的 opencode 对话内容，提炼出有价值的每日总结。

判断标准（符合任一即可）：
- 用户学了新概念并实践了
- 用户踩了坑并解决了
- 对话中有可复用的经验或方法论
- 完成了一个完整的功能或任务

如果**有值得提炼的内容**，请按以下格式输出（直接输出，不要加代码块）：

### 今日要点

**1. [事项小标题]**

[做了什么，一段话说清。要写具体：用了什么技术/工具、改了什么文件、关键参数是什么，不要只写"搭了XX功能"]

> [踩的坑 / 沉淀的经验 / 可复用的方法论，用 blockquote 框出。要写具体：根因是什么、怎么解决的、可复用的判断标准是什么]

**2. [事项小标题]**

...

### 变现相关的思考（如有）
- xxx

### 其他（如有）
- xxx

### 下一步
- [ ] [待办事项，从对话中提取用户提到"接下来要做的"内容]

格式要求：
- 采用"今日要点"单段结构，同一件事的"做了什么 + 踩的坑 + 沉淀的经验"合并在一条里，不要拆成"完成的工作/提炼的知识点/可复用的经验"三段重复结构
- 每条 = 小标题 + 做了什么 + blockquote 沉淀，三者一气呵成
- blockquote 用 > 开头，写踩的坑、根因、可复用的经验、方法论等有认知增量的内容
- 完成的工作精简到 5-6 条，只保留有认知增量的，纯执行动作不单列
- **内容要具体**：写"改了 XX 文件的 XX 函数"，不写"改了后端代码"
- **下一步从对话中提取**：用户在对话中提到的"接下来要做的""下次要XX"等内容

如果**今天没有值得提炼的内容**（纯闲聊、重复确认、格式调整等），请只输出一句话：

### 说明
今日对话以日常操作为主，无特别值得提炼的内容。

注意：
- 只输出一个日期下的内容，不要自己加 ## 日期标题
- 内容要简洁，不写流水账
- 用中文`
        },
        {
          role: 'user',
          content: `今天的对话内容：\n\n${allText}`
        }
      ]
    };

    const postData = JSON.stringify(prompt);
    const url = new URL(CONFIG.apiURL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.apiKey}`,
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.choices && result.choices[0]) {
            resolve(result.choices[0].message.content);
          } else {
            reject(new Error('GLM 返回异常: ' + data));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('GLM 请求超时'));
    });
    req.write(postData);
    req.end();
  });
}

// ============ 写入总结文件（每天单独一个文件，按月份子目录归档） ============
function getOutputFile(dateStr) {
  const monthDir = dateStr.slice(0, 7); // "2026-08-12" → "2026-08"
  return path.join(CONFIG.outputDir, monthDir, `每日总结-${dateStr}${CONFIG.machineSuffix}.md`);
}

function writeSummary(content, dateStr) {
  const today = new Date();
  if (!dateStr) {
    dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }
  const outputFile = getOutputFile(dateStr);
  // 确保月份子目录存在（按月归档结构：产出/每日总结/2026-08/）
  const monthDir = path.dirname(outputFile);
  if (!fs.existsSync(monthDir)) {
    fs.mkdirSync(monthDir, { recursive: true });
  }
  // 时间格式：YYYY-MM-DD HH:mm:ss（用本地时区，纯数字避免编码问题）
  const pad = n => String(n).padStart(2, '0');
  const timeStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())} ${pad(today.getHours())}:${pad(today.getMinutes())}:${pad(today.getSeconds())}`;
  const machineNote = CONFIG.machineSuffix ? `\n> 机器标识：${CONFIG.machineSuffix.slice(1)}` : '';

  if (fs.existsSync(outputFile)) {
    // 当天文件已存在：更新头部时间 + 追加内容
    let existing = fs.readFileSync(outputFile, 'utf8');
    // 更新头部的归档时间（匹配 "在 YYYY-MM-DD HH:mm:ss 生成"）
    existing = existing.replace(
      /在 \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} 生成/,
      `在 ${timeStr} 生成`
    );
    // 去掉末尾的 --- 分隔符再追加
    if (existing.endsWith('---\n')) {
      existing = existing.slice(0, -4);
    } else if (existing.endsWith('---')) {
      existing = existing.slice(0, -3);
    }
    // 追加本次归档的时间戳 + 内容
    existing += `\n\n<!-- 归档时间：${timeStr} -->\n\n${content}\n\n---\n`;
    fs.writeFileSync(outputFile, existing, 'utf8');
    log(`当天文件已存在，已追加内容到 ${outputFile}`);
  } else {
    // 当天首次生成
    const header = `# 每日总结 - ${dateStr}${CONFIG.machineSuffix}\n\n> 自动归档：由 scripts/auto-summary.js 在 ${timeStr} 生成\n> 规则：AI 分析当天本项目的 opencode 对话，提炼值得沉淀的内容${machineNote}\n\n<!-- 归档时间：${timeStr} -->\n\n---\n\n`;
    const newContent = header + content + '\n\n---\n';
    fs.writeFileSync(outputFile, newContent, 'utf8');
    log(`已生成当天文件：${outputFile}`);
  }
}

// ============ 读取/写入已处理的 session 记录（用于去重） ============
function getProcessedSessions(dateStr) {
  const recordFile = path.join(CONFIG.projectDir, '.summary-sessions.json');
  if (!fs.existsSync(recordFile)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
    return data[dateStr] || [];
  } catch {
    return [];
  }
}

function saveProcessedSessions(dateStr, sessionIds) {
  const recordFile = path.join(CONFIG.projectDir, '.summary-sessions.json');
  let data = {};
  if (fs.existsSync(recordFile)) {
    try { data = JSON.parse(fs.readFileSync(recordFile, 'utf8')); } catch {}
  }
  data[dateStr] = sessionIds;
  fs.writeFileSync(recordFile, JSON.stringify(data, null, 2), 'utf8');
}

// ============ 主流程 ============
async function main() {
  log('=== 每日总结开始 ===');

  try {
    // 1. 提取今天的对话
    const { date, conversations } = await extractTodayConversations();

    if (conversations.length === 0) {
      log('今天没有对话，不生成总结文件');
      return;
    }

    // 2. 去重：过滤掉已处理过的 session
    const processedIds = getProcessedSessions(date);
    const newConversations = conversations.filter(c => !processedIds.includes(c.sessionId));
    if (newConversations.length === 0) {
      log(`今天的 ${conversations.length} 个会话均已处理过，跳过`);
      return;
    }
    log(`新增 ${newConversations.length} 个会话（已处理 ${processedIds.length} 个）`);

    // 3. 调 GLM 分析
    log(`共 ${newConversations.length} 个对话，开始调 GLM 分析`);
    const summary = await analyzeWithGLM(newConversations, date);

    // 4. 写入文件（按月份子目录归档，当天文件追加）
    writeSummary(summary.trim(), date);

    // 5. 记录已处理的 session
    const allProcessed = [...processedIds, ...newConversations.map(c => c.sessionId)];
    saveProcessedSessions(date, allProcessed);

    log('=== 每日总结完成 ===');
  } catch (e) {
    log('错误: ' + e.message);
    process.exit(1);
  }
}

main();
