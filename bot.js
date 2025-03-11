// 引入必要的模块
const Discord = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const { MessageEmbed, MessageActionRow, MessageButton } = require('discord.js');

// 创建一个新的 Discord 客户端
const client = new Discord.Client({ 
  intents: [Discord.Intents.FLAGS.GUILDS],
  partials: ['MESSAGE', 'CHANNEL', 'REACTION']
});

/*...现有代码...*/

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
  },
  {
    name: 'listhis',
    description: 'View your current conversation history with the AI',
  }
];

/*...现有代码...*/

// 存储分页历史记录的对象
const historyPagination = {};

// 每页显示的消息数量
const MESSAGES_PER_PAGE = 5;

// 创建对话历史嵌入式消息
function createHistoryEmbed(userId, page = 0) {
  const history = conversations[userId] || [];
  
  // 跳过系统提示消息
  const userMessages = history.slice(1);
  const totalPages = Math.ceil(userMessages.length / MESSAGES_PER_PAGE);
  
  // 确保页码在有效范围内
  page = Math.max(0, Math.min(page, totalPages - 1));
  
  // 计算当前页的消息
  const startIndex = page * MESSAGES_PER_PAGE;
  const endIndex = Math.min(startIndex + MESSAGES_PER_PAGE, userMessages.length);
  const pageMessages = userMessages.slice(startIndex, endIndex);
  
  // 创建嵌入式消息
  const embed = new MessageEmbed()
    .setColor('#0099ff')
    .setTitle('对话历史')
    .setDescription(`显示第 ${startIndex + 1} 到 ${endIndex} 条消息，共 ${userMessages.length} 条`)
    .setFooter({ text: `第 ${page + 1} 页，共 ${totalPages} 页` });
  
  // 添加消息到嵌入式消息
  for (let i = 0; i < pageMessages.length; i++) {
    const message = pageMessages[i];
    const role = message.role === 'user' ? '你' : 'AI';
    
    // 截断过长的消息
    let content = message.content;
    if (content.length > 1024) {
      content = content.substring(0, 1021) + '...';
    }
    
    embed.addField(`${role}:`, content);
  }
  
  return { embed, currentPage: page, totalPages };
}

// 创建分页按钮
function createPaginationButtons(currentPage, totalPages) {
  const row = new MessageActionRow();
  
  // 添加上一页按钮
  row.addComponents(
    new MessageButton()
      .setCustomId('prev_page')
      .setLabel('上一页')
      .setStyle('PRIMARY')
      .setDisabled(currentPage <= 0)
  );
  
  // 添加下一页按钮
  row.addComponents(
    new MessageButton()
      .setCustomId('next_page')
      .setLabel('下一页')
      .setStyle('PRIMARY')
      .setDisabled(currentPage >= totalPages - 1)
  );
  
  return row;
}

// 当收到 interaction (斜杠命令) 时触发
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand() && !interaction.isButton()) return;

  const userId = interaction.user.id;
  
  // 处理按钮交互
  if (interaction.isButton()) {
    // 检查是否是分页按钮
    if (interaction.customId === 'prev_page' || interaction.customId === 'next_page') {
      // 检查用户是否有分页数据
      if (!historyPagination[userId]) {
        await interaction.reply({ 
          content: '会话已过期，请重新使用 /listhis 命令查看历史记录。', 
          ephemeral: true 
        });
        return;
      }
      
      // 计算新的页码
      let newPage = historyPagination[userId].currentPage;
      if (interaction.customId === 'prev_page') {
        newPage--;
      } else {
        newPage++;
      }
      
      // 创建新的嵌入式消息和按钮
      const { embed, currentPage, totalPages } = createHistoryEmbed(userId, newPage);
      const row = createPaginationButtons(currentPage, totalPages);
      
      // 更新分页数据
      historyPagination[userId].currentPage = currentPage;
      
      // 更新消息
      await interaction.update({ 
        embeds: [embed], 
        components: [row] 
      });
      
      return;
    }
  }

  // 处理命令交互
  if (interaction.isCommand()) {
    const { commandName } = interaction;

    /*...现有代码...*/

    else if (commandName === 'listhis') {
      // 检查用户是否有对话历史
      if (!conversations[userId] || conversations[userId].length <= 1) {
        await interaction.reply({
          content: '你还没有任何对话历史。',
          ephemeral: true
        });
        return;
      }
      
      // 创建嵌入式消息和按钮
      const { embed, currentPage, totalPages } = createHistoryEmbed(userId);
      const row = createPaginationButtons(currentPage, totalPages);
      
      // 存储分页数据
      historyPagination[userId] = { currentPage };
      
      // 发送嵌入式消息和按钮
      await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true
      });
    }
  }
});

// 设置一个定时器，清理过期的分页数据（例如，30分钟后）
setInterval(() => {
  const now = Date.now();
  for (const userId in historyPagination) {
    if (now - historyPagination[userId].timestamp > 30 * 60 * 1000) {
      delete historyPagination[userId];
    }
  }
}, 10 * 60 * 1000); // 每10分钟检查一次

/*...现有代码...*/