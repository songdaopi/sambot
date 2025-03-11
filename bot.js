// 引入必要的模块
const Discord = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');

// 创建一个新的 Discord 客户端
const client = new Discord.Client({ 
  intents: [Discord.Intents.FLAGS.GUILDS]
});

// Bot Token 和 Client ID
const token = 'YOUR_BOT_TOKEN';
const clientId = 'YOUR_CLIENT_ID';

// 创建 OpenAI 客户端
const openai = new OpenAI({
  apiKey: 'YOUR_OPENAI_API_KEY',
  baseURL: 'YOUR_CUSTOM_API_URL',
});

// 存储用户对话历史的对象
const conversations = {};

// 默认的系统提示
const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

// 数据文件路径
const DATA_DIR = './data';
const SYSTEM_PROMPTS_FILE = path.join(DATA_DIR, 'system_prompts.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// 加载系统提示
function loadSystemPrompts() {
  try {
    if (fs.existsSync(SYSTEM_PROMPTS_FILE)) {
      const data = fs.readFileSync(SYSTEM_PROMPTS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading system prompts:', error);
  }
  return {};
}

// 保存系统提示
function saveSystemPrompts() {
  try {
    fs.writeFileSync(SYSTEM_PROMPTS_FILE, JSON.stringify(userSystemPrompts, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving system prompts:', error);
  }
}

// 初始化用户系统提示
const userSystemPrompts = loadSystemPrompts();

// 最大对话历史长度（消息对数）
const MAX_HISTORY_LENGTH = 80;

// 定义斜杠命令
const commands = [
  {
    name: 'ping',
    description: 'Replies with Pong!',
  },
  {
    name: 'ai',
    description: 'Send a message to AI and get a response',
    options: [
      {
        name: 'message',
        type: 3, // STRING
        description: 'The message to send to AI',
        required: true,
      },
    ],
  },
  {
    name: 'clear',
    description: 'Clear your conversation history with the AI',
  },
  {
    name: 'system',
    description: 'Set a custom system prompt for the AI',
    options: [
      {
        name: 'prompt',
        type: 3, // STRING
        description: 'The system prompt to set (leave empty to view current)',
        required: false,
      },
    ],
  },
  {
    name: 'reset_system',
    description: 'Reset the system prompt to default',
  }
];

// 这里是函数应该插入的位置
// =====================================================

// 获取用户的系统提示
function getUserSystemPrompt(userId) {
  return userSystemPrompts[userId] || DEFAULT_SYSTEM_PROMPT;
}

// 设置用户的系统提示
function setUserSystemPrompt(userId, prompt) {
  userSystemPrompts[userId] = prompt;
  
  // 保存到文件
  saveSystemPrompts();
  
  // 如果用户已有对话，更新系统提示
  if (conversations[userId] && conversations[userId].length > 0) {
    if (conversations[userId][0].role === "system") {
      conversations[userId][0].content = prompt;
    } else {
      conversations[userId].unshift({ role: "system", content: prompt });
    }
  }
}

// 初始化或重置用户的对话
function initializeConversation(userId) {
  const systemPrompt = getUserSystemPrompt(userId);
  conversations[userId] = [
    { role: "system", content: systemPrompt }
  ];
}

// =====================================================

// 当客户端准备就绪时触发，只会触发一次
client.once('ready', () => {
  console.log('Bot is ready!');

  // 注册斜杠命令
  const rest = new REST({ version: '9' }).setToken(token);

  (async () => {
    try {
      // 在所有服务器上注册命令
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands },
      );
      console.log('Successfully registered application commands globally.');
    } catch (error) {
      console.error(error);
    }
  })();
});

// 当收到 interaction (斜杠命令) 时触发
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;
  const userId = interaction.user.id;

  if (commandName === 'ping') {
    await interaction.reply('Pong!');
  } else if (commandName === 'ai') {
    // 获取用户输入的消息
    const userMessage = interaction.options.getString('message');
    
    // 先回复一个临时消息，因为 API 调用可能需要一些时间
    await interaction.deferReply();
    
    try {
      // 初始化用户的对话历史（如果不存在）
      if (!conversations[userId]) {
        initializeConversation(userId);
      }
      
      // 添加用户消息到对话历史
      conversations[userId].push({ role: "user", content: userMessage });
      
      // 调用 OpenAI API，传递完整的对话历史
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: conversations[userId],
        max_tokens: 1000,
      });
      
      // 获取 AI 的回复
      const aiResponse = response.choices[0].message.content;
      
      // 添加 AI 回复到对话历史
      conversations[userId].push({ role: "assistant", content: aiResponse });
      
      // 如果对话历史太长，删除最早的消息（保留 system 消息）
      if (conversations[userId].length > MAX_HISTORY_LENGTH + 1) {
        conversations[userId] = [
          conversations[userId][0],
          ...conversations[userId].slice(-(MAX_HISTORY_LENGTH))
        ];
      }
      
      // 发送回复
      await interaction.editReply({
        content: `**AI 回复:** ${aiResponse}`,
      });
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      await interaction.editReply({
        content: '抱歉，调用 AI 时出现了错误。请稍后再试。',
      });
    }
  } else if (commandName === 'clear') {
    // 清除用户的对话历史，但保持系统提示
    initializeConversation(userId);
    
    await interaction.reply({
      content: '你的对话历史已清除。系统提示保持不变。',
      ephemeral: true
    });
  } else if (commandName === 'system') {
    const newPrompt = interaction.options.getString('prompt');
    
    if (newPrompt) {
      // 设置新的系统提示
      setUserSystemPrompt(userId, newPrompt);
      
      await interaction.reply({
        content: `系统提示已更新为: "${newPrompt}"`,
        ephemeral: true
      });
    } else {
      // 显示当前系统提示
      const currentPrompt = getUserSystemPrompt(userId);
      
      await interaction.reply({
        content: `当前系统提示: "${currentPrompt}"`,
        ephemeral: true
      });
    }
  } else if (commandName === 'reset_system') {
    // 重置系统提示为默认值
    setUserSystemPrompt(userId, DEFAULT_SYSTEM_PROMPT);
    
    await interaction.reply({
      content: `系统提示已重置为默认值: "${DEFAULT_SYSTEM_PROMPT}"`,
      ephemeral: true
    });
  }
});

// 使用你的 Bot Token 登录 Discord
client.login(token);