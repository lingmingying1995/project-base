/**
 * 每日对话自动归档脚本（模板）
 *
 * 功能：每天由系统计划任务触发
 *   1. 读取 opencode.db，提取今天本项目的对话内容
 *   2. 调用 GLM API 分析对话
 *   3. AI 判断是否有值得提炼的内容
 *   4. 有内容 → 写入 产出/每日总结/每日总结-YYYY-MM-DD.md
 *      无内容 → 不建空文件
 *
 * 用法：
 *   node scripts/auto-summary.js              # 工作电脑（无后缀）
 *   node scripts\auto-summary.js --machine=home  # 家用电脑（文件加 -HOME 后缀）
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

  const now = new Date();
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
          content: `你是 PROJECT_NAME 项目的开发记录助手。请分析今天的对话内容，提炼出有价值的每日总结。

要求：
1. 只记录有认知增量的内容，不写流水账
2. 格式用"今日要点"结构，每条 = 小标题 + 做了什么 + blockquote 沉淀的经验/踩的坑
3. 如果今天没有有价值的对话内容，返回 "EMPTY" 两个字
4. 完成的工作精简到5-6条，只保留有认知增量的
5. 标题里的日期用 ${dateStr}，不要自己编

输出格式：
# 每日总结 - ${dateStr}

> 主题：[今天的主要主题]

---

## 今日要点

**1. [事项小标题]**

[做了什么，一段话说清]

> [踩的坑 / 沉淀的经验 / 可复用的方法论，用 blockquote 框出]

**2. [事项小标题]**

...

---

## 下一步

- [ ] [下一步要做的事]`
        },
        {
          role: 'user',
          content: `今天的对话内容：\n\n${allText}`
        }
      ]
    };

    const postData = JSON.stringify(prompt);
    const req = https.request(CONFIG.apiURL, {
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

// ============ 主流程 ============
async function main() {
  log('=== 每日总结开始 ===');

  try {
    const { date, conversations } = await extractTodayConversations();

    if (conversations.length === 0) {
      log('今天没有对话，不生成总结文件');
      return;
    }

    log(`共 ${conversations.length} 个对话，开始调 GLM 分析`);

    const summary = await analyzeWithGLM(conversations, date);

    if (summary.trim() === 'EMPTY' || summary.includes('EMPTY')) {
      log('GLM 判断今天没有值得提炼的内容，不生成总结文件');
      return;
    }

    const fileName = `每日总结-${date}${CONFIG.machineSuffix}.md`;
    const filePath = path.join(CONFIG.outputDir, fileName);

    // 确保输出目录存在
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });

    fs.writeFileSync(filePath, summary, 'utf-8');
    log(`总结已写入: ${filePath}`);

    log('=== 每日总结完成 ===');
  } catch (e) {
    log('错误: ' + e.message);
    process.exit(1);
  }
}

main();
