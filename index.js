const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder, Collection } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ]
});

const userMessages = new Map();
const userWarnings = new Map();

client.once('ready', () => {
  console.log(`✅ Moderation bot is online as ${client.user.tag}!`);
  console.log(`📊 Serving ${client.guilds.cache.size} server(s)`);
  console.log(`🛡️ Prefix: ${config.prefix}`);
  client.user.setActivity('for rule breakers', { type: 'WATCHING' });
});

async function getModLogChannel(guild) {
  let channel = guild.channels.cache.find(ch => ch.name === config.modLogChannelName);
  if (!channel) {
    try {
      channel = await guild.channels.create({
        name: config.modLogChannelName,
        type: 0,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.SendMessages],
          },
        ],
      });
      console.log(`Created ${config.modLogChannelName} channel`);
    } catch (error) {
      console.error('Error creating mod log channel:', error);
    }
  }
  return channel;
}

async function logAction(guild, action, moderator, target, reason = 'No reason provided') {
  const logChannel = await getModLogChannel(guild);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setColor(action === 'WARN' ? '#ffaa00' : action === 'MUTE' || action === 'KICK' ? '#ff5500' : '#ff0000')
    .setTitle(`🔨 ${action}`)
    .addFields(
      { name: '👤 User', value: `${target.tag} (${target.id})`, inline: true },
      { name: '👮 Moderator', value: `${moderator.tag}`, inline: true },
      { name: '📝 Reason', value: reason }
    )
    .setTimestamp()
    .setFooter({ text: 'Moderation Log' });

  logChannel.send({ embeds: [embed] });
}

async function ensureMuteRole(guild) {
  let muteRole = guild.roles.cache.find(role => role.name === config.muteRoleName);
  
  if (!muteRole) {
    try {
      muteRole = await guild.roles.create({
        name: config.muteRoleName,
        color: '#818386',
        permissions: []
      });

      guild.channels.cache.forEach(async (channel) => {
        await channel.permissionOverwrites.create(muteRole, {
          SendMessages: false,
          AddReactions: false,
          Speak: false
        });
      });
      
      console.log('Mute role created and applied to all channels');
    } catch (error) {
      console.error('Error creating mute role:', error);
    }
  }
  
  return muteRole;
}

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const userId = message.author.id;
  const userKey = `${guildId}-${userId}`;
  const now = Date.now();
  
  if (!userMessages.has(userKey)) {
    userMessages.set(userKey, []);
  }
  
  const timestamps = userMessages.get(userKey);
  timestamps.push(now);
  
  const recentMessages = timestamps.filter(time => now - time < config.messageInterval);
  userMessages.set(userKey, recentMessages);

  if (recentMessages.length > config.maxMessages) {
    try {
      await message.delete();
      const warningMsg = await message.channel.send(`⚠️ ${message.author}, slow down! You're sending messages too quickly.`);
      setTimeout(() => warningMsg.delete(), 5000);
      
      await logAction(message.guild, 'AUTO-MOD: SPAM', client.user, message.author, 'Sending messages too quickly');
      return;
    } catch (error) {
      console.error('Error handling spam:', error);
    }
  }

  const mentionCount = (message.mentions.users.size + message.mentions.roles.size);
  if (mentionCount > config.maxMentions) {
    try {
      await message.delete();
      const warningMsg = await message.channel.send(`⚠️ ${message.author}, too many mentions in one message!`);
      setTimeout(() => warningMsg.delete(), 5000);
      
      await logAction(message.guild, 'AUTO-MOD: MENTION SPAM', client.user, message.author, `Too many mentions (${mentionCount})`);
      return;
    } catch (error) {
      console.error('Error handling mention spam:', error);
    }
  }

  const lowerContent = message.content.toLowerCase();
  for (const word of config.blockedWords) {
    if (lowerContent.includes(word.toLowerCase())) {
      try {
        await message.delete();
        const warningMsg = await message.channel.send(`⚠️ ${message.author}, your message contained a blocked word and has been removed.`);
        setTimeout(() => warningMsg.delete(), 5000);
        
        await logAction(message.guild, 'AUTO-MOD: BLOCKED WORD', client.user, message.author, `Message contained: "${word}"`);
        return;
      } catch (error) {
        console.error('Error handling blocked word:', error);
      }
    }
  }

  if (!message.content.startsWith(config.prefix)) return;

  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();


  if (command === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('🛡️ Moderation Bot Commands')
      .setDescription('Here are all available moderation commands:')
      .addFields(
        { name: `${config.prefix}kick @user [reason]`, value: 'Kick a user from the server' },
        { name: `${config.prefix}ban @user [reason]`, value: 'Ban a user from the server' },
        { name: `${config.prefix}unban <userID>`, value: 'Unban a user by their ID' },
        { name: `${config.prefix}mute @user [reason]`, value: 'Mute a user' },
        { name: `${config.prefix}unmute @user`, value: 'Unmute a user' },
        { name: `${config.prefix}warn @user [reason]`, value: 'Warn a user' },
        { name: `${config.prefix}warnings @user`, value: 'Check warnings for a user' },
        { name: `${config.prefix}clearwarnings @user`, value: 'Remove all warnings from a user' },
        { name: `${config.prefix}addrole @user <role name>`, value: 'Add a role to a user' },
        { name: `${config.prefix}removerole @user <role name>`, value: 'Remove a role from a user' },
        { name: `${config.prefix}clear <amount>`, value: 'Delete bulk messages (1-100)' },
        { name: `${config.prefix}help`, value: 'Show this help message' }
      )
      .setFooter({ text: 'Auto-moderation is always active!' })
      .setTimestamp();
    
    return message.channel.send({ embeds: [helpEmbed] });
  }

  if (command === 'kick') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('❌ You need Kick Members permission to use this command!');
    }

    const member = message.mentions.members.first();
    if (!member) {
      return message.reply('❌ Please mention a user to kick!');
    }

    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('❌ I don\'t have permission to kick members!');
    }

    if (member.roles.highest.position >= message.member.roles.highest.position) {
      return message.reply('❌ You cannot kick this user!');
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';

    try {
      await member.kick(reason);
      message.channel.send(`✅ Successfully kicked ${member.user.tag}`);
      await logAction(message.guild, 'KICK', message.author, member.user, reason);
    } catch (error) {
      console.error('Error kicking user:', error);
      message.reply('❌ Failed to kick the user!');
    }
  }

  if (command === 'ban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ You need Ban Members permission to use this command!');
    }

    const member = message.mentions.members.first();
    if (!member) {
      return message.reply('❌ Please mention a user to ban!');
    }

    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ I don\'t have permission to ban members!');
    }

    if (member.roles.highest.position >= message.member.roles.highest.position) {
      return message.reply('❌ You cannot ban this user!');
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';

    try {
      await member.ban({ reason });
      message.channel.send(`✅ Successfully banned ${member.user.tag}`);
      await logAction(message.guild, 'BAN', message.author, member.user, reason);
    } catch (error) {
      console.error('Error banning user:', error);
      message.reply('❌ Failed to ban the user!');
    }
  }

  if (command === 'unban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ You need Ban Members permission to use this command!');
    }

    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
      return message.reply('❌ I don\'t have permission to unban members!');
    }

    const userId = args[0];
    if (!userId) {
      return message.reply('❌ Please provide a user ID to unban! Example: `p!unban 123456789012345678`');
    }

    try {
      const bannedUsers = await message.guild.bans.fetch();
      const bannedUser = bannedUsers.get(userId);
      
      if (!bannedUser) {
        return message.reply('❌ This user is not banned or the ID is invalid!');
      }

      await message.guild.members.unban(userId);
      message.channel.send(`✅ Successfully unbanned ${bannedUser.user.tag}`);
      await logAction(message.guild, 'UNBAN', message.author, bannedUser.user, 'Unbanned');
    } catch (error) {
      console.error('Error unbanning user:', error);
      message.reply('❌ Failed to unban the user! Make sure the user ID is correct.');
    }
  }

  if (command === 'mute') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply('❌ You need Manage Roles permission to use this command!');
    }

    const member = message.mentions.members.first();
    if (!member) {
      return message.reply('❌ Please mention a user to mute!');
    }

    if (member.roles.highest.position >= message.member.roles.highest.position) {
      return message.reply('❌ You cannot mute this user!');
    }

    const muteRole = await ensureMuteRole(message.guild);
    const reason = args.slice(1).join(' ') || 'No reason provided';

    try {
      await member.roles.add(muteRole);
      message.channel.send(`✅ Successfully muted ${member.user.tag}`);
      await logAction(message.guild, 'MUTE', message.author, member.user, reason);
    } catch (error) {
      console.error('Error muting user:', error);
      message.reply('❌ Failed to mute the user!');
    }
  }

  if (command === 'unmute') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply('❌ You need Manage Roles permission to use this command!');
    }

    const member = message.mentions.members.first();
    if (!member) {
      return message.reply('❌ Please mention a user to unmute!');
    }

    const muteRole = message.guild.roles.cache.find(role => role.name === config.muteRoleName);
    if (!muteRole) {
      return message.reply('❌ Mute role not found!');
    }

    try {
      await member.roles.remove(muteRole);
      message.channel.send(`✅ Successfully unmuted ${member.user.tag}`);
      await logAction(message.guild, 'UNMUTE', message.author, member.user, 'Unmuted');
    } catch (error) {
      console.error('Error unmuting user:', error);
      message.reply('❌ Failed to unmute the user!');
    }
  }

  if (command === 'warn') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers) && 
        !message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('❌ You need moderation permissions to use this command!');
    }

    const member = message.mentions.members.first();
    if (!member) {
      return message.reply('❌ Please mention a user to warn!');
    }

    const reason = args.slice(1).join(' ') || 'No reason provided';
    const warningKey = `${guildId}-${member.id}`;
    
    if (!userWarnings.has(warningKey)) {
      userWarnings.set(warningKey, []);
    }
    
    userWarnings.get(warningKey).push({
      moderator: message.author.tag,
      reason: reason,
      timestamp: new Date()
    });

    const warningCount = userWarnings.get(warningKey).length;
    
    message.channel.send(`⚠️ ${member.user.tag} has been warned! (Total warnings: ${warningCount})`);
    await logAction(message.guild, 'WARN', message.author, member.user, reason);

    try {
      await member.send(`⚠️ You have been warned in **${message.guild.name}**\n**Reason:** ${reason}\n**Total warnings:** ${warningCount}`);
    } catch (error) {
      console.log('Could not DM user');
    }
  }

  if (command === 'warnings') {
    const member = message.mentions.members.first();
    if (!member) {
      return message.reply('❌ Please mention a user to check warnings!');
    }

    const warningKey = `${guildId}-${member.id}`;
    const warnings = userWarnings.get(warningKey) || [];
    
    if (warnings.length === 0) {
      return message.channel.send(`✅ ${member.user.tag} has no warnings!`);
    }

    const embed = new EmbedBuilder()
      .setColor('#ffaa00')
      .setTitle(`⚠️ Warnings for ${member.user.tag}`)
      .setDescription(`Total warnings: ${warnings.length}`)
      .setTimestamp();

    warnings.forEach((warn, index) => {
      embed.addFields({
        name: `Warning #${index + 1}`,
        value: `**Moderator:** ${warn.moderator}\n**Reason:** ${warn.reason}\n**Date:** ${warn.timestamp.toLocaleString()}`
      });
    });

    message.channel.send({ embeds: [embed] });
  }

  if (command === 'clearwarnings') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers) && 
        !message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply('❌ You need moderation permissions to use this command!');
    }

    const member = message.mentions.members.first();
    if (!member) {
      return message.reply('❌ Please mention a user to clear warnings!');
    }

    const warningKey = `${guildId}-${member.id}`;
    const previousWarnings = userWarnings.get(warningKey) || [];
    
    if (previousWarnings.length === 0) {
      return message.channel.send(`ℹ️ ${member.user.tag} has no warnings to clear!`);
    }

    const warningCount = previousWarnings.length;
    userWarnings.delete(warningKey);
    
    message.channel.send(`✅ Cleared ${warningCount} warning(s) for ${member.user.tag}`);
    await logAction(message.guild, 'CLEAR WARNINGS', message.author, member.user, `Cleared ${warningCount} warning(s)`);

    try {
      await member.send(`✅ Your warnings in **${message.guild.name}** have been cleared by ${message.author.tag}`);
    } catch (error) {
      console.log('Could not DM user');
    }
  }

  if (command === 'clear') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ You need Manage Messages permission to use this command!');
    }

    const amount = parseInt(args[0]);

    if (isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply('❌ Please provide a number between 1 and 100!');
    }

    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ I don\'t have permission to delete messages!');
    }

    try {
      const messages = await message.channel.messages.fetch({ limit: amount + 1 });
      await message.channel.bulkDelete(messages, true);
      
      const confirmMsg = await message.channel.send(`✅ Successfully deleted ${amount} messages!`);
      setTimeout(() => confirmMsg.delete(), 5000);
      
      await logAction(message.guild, 'CLEAR', message.author, message.author, `Deleted ${amount} messages in ${message.channel.name}`);
    } catch (error) {
      console.error('Error deleting messages:', error);
      message.reply('❌ Failed to delete messages! (Messages older than 14 days cannot be bulk deleted)');
    }
  }

  if (command === 'addrole') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply('❌ You need Manage Roles permission to use this command!');
    }

    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply('❌ I don\'t have permission to manage roles!');
    }

    const member = message.mentions.members.first();
    if (!member) {
      return message.reply('❌ Please mention a user to add a role to!');
    }

    const roleName = args.slice(1).join(' ');
    if (!roleName) {
      return message.reply('❌ Please specify a role name! Example: `p!addrole @user Member`');
    }

    const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
    if (!role) {
      return message.reply(`❌ Role "${roleName}" not found!`);
    }

    const isOwnerOnlyRole = config.ownerOnlyRoles.some(ownerRole => ownerRole.toLowerCase() === role.name.toLowerCase());
    if (isOwnerOnlyRole && message.author.id !== message.guild.ownerId) {
      return message.reply(`❌ Only the server owner can assign the **${role.name}** role!`);
    }

    if (role.position >= message.guild.members.me.roles.highest.position) {
      return message.reply('❌ I cannot assign this role because it is higher than or equal to my highest role!');
    }

    if (role.position >= message.member.roles.highest.position && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ You cannot assign this role because it is higher than or equal to your highest role!');
    }

    if (member.roles.cache.has(role.id)) {
      return message.reply(`❌ ${member.user.tag} already has the ${role.name} role!`);
    }

    try {
      await member.roles.add(role);
      message.channel.send(`✅ Added **${role.name}** role to ${member.user.tag}`);
      await logAction(message.guild, 'ADD ROLE', message.author, member.user, `Added role: ${role.name}`);
    } catch (error) {
      console.error('Error adding role:', error);
      message.reply('❌ Failed to add the role!');
    }
  }

  if (command === 'removerole') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply('❌ You need Manage Roles permission to use this command!');
    }

    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply('❌ I don\'t have permission to manage roles!');
    }

    const member = message.mentions.members.first();
    if (!member) {
      return message.reply('❌ Please mention a user to remove a role from!');
    }

    const roleName = args.slice(1).join(' ');
    if (!roleName) {
      return message.reply('❌ Please specify a role name! Example: `p!removerole @user Member`');
    }

    const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
    if (!role) {
      return message.reply(`❌ Role "${roleName}" not found!`);
    }

    const isOwnerOnlyRole = config.ownerOnlyRoles.some(ownerRole => ownerRole.toLowerCase() === role.name.toLowerCase());
    if (isOwnerOnlyRole && message.author.id !== message.guild.ownerId) {
      return message.reply(`❌ Only the server owner can remove the **${role.name}** role!`);
    }

    if (role.position >= message.guild.members.me.roles.highest.position) {
      return message.reply('❌ I cannot remove this role because it is higher than or equal to my highest role!');
    }

    if (role.position >= message.member.roles.highest.position && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ You cannot remove this role because it is higher than or equal to your highest role!');
    }

    if (!member.roles.cache.has(role.id)) {
      return message.reply(`❌ ${member.user.tag} doesn't have the ${role.name} role!`);
    }

    try {
      await member.roles.remove(role);
      message.channel.send(`✅ Removed **${role.name}** role from ${member.user.tag}`);
      await logAction(message.guild, 'REMOVE ROLE', message.author, member.user, `Removed role: ${role.name}`);
    } catch (error) {
      console.error('Error removing role:', error);
      message.reply('❌ Failed to remove the role!');
    }
  }
});

client.on('error', error => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

client.login(process.env.TOKEN);
