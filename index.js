require("dotenv").config();
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web server running");
});
const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");

// ✅ Create client (IMPORTANT: includes GuildMembers)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers, // 🔥 REQUIRED
  ],
});

// ✅ Load config
let config = {};
if (fs.existsSync("config.json")) {
  config = JSON.parse(fs.readFileSync("config.json"));
} else {
  fs.writeFileSync("config.json", JSON.stringify({}, null, 2));
}

// ✅ Notify Mods Function
async function notifyMods(guild, config, channelName) {
  const guildId = guild.id;

  console.log("📌 Guild ID:", guildId);

  if (!config[guildId]) {
    console.log("❌ No config for this server");
    return;
  }

  const roleId = config[guildId].modRole;

  if (!roleId) {
    console.log("❌ No role set");
    return;
  }

  // 🔥 FETCH ALL MEMBERS (IMPORTANT FIX)
  await guild.members.fetch();

  const role = guild.roles.cache.get(roleId);

  if (!role) {
    console.log("❌ Role not found");
    return;
  }

  console.log("✅ Role:", role.name);
  console.log("👥 Members:", role.members.size);

  role.members.forEach(async (member) => {
    try {
      await member.send(`📩 New ticket created!
📁 Channel: ${channelName}
🔗 Server: ${guild.name}`);
      console.log(`✅ DM sent to ${member.user.tag}`);
    } catch (err) {
      console.log(`❌ Cannot DM ${member.user.tag}`);
    }
  });
}

// ✅ Bot Ready
client.once("ready", () => {
  console.log(`✅ Bot is online: ${client.user.tag}`);
});

// ✅ Command: Set Mod Role
client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  console.log("Message received:", message.content);

  if (message.content.startsWith("!setmodrole")) {
    const guildId = message.guild.id;

    const role = message.mentions.roles.first();

    if (!role) {
      return message.reply("❌ Please mention a role like @Admin");
    }

    if (!config[guildId]) {
      config[guildId] = {};
    }

    config[guildId].modRole = role.id;

    fs.writeFileSync("config.json", JSON.stringify(config, null, 2));

    message.reply(`✅ Mod role set to ${role.name}`);
  }

  // Optional test command
if (message.content === "!testdm") {
  notifyMods(message.guild, config, message.channel.name);
}
});

// 🔥 IMPORTANT: Detect Ticket Tool ticket creation
client.on("channelCreate", (channel) => {
  if (!channel.guild) return;

  console.log("📢 Channel created:", channel.name);

  // detect ticket channels (edit if needed)
  if (channel.name.includes("ticket")) {
    console.log("🎫 Ticket detected!");
    notifyMods(channel.guild, config, channel.name);
  }
});
// ✅ Login
client.login(process.env.TOKEN);
