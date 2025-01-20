const discord = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

// Logging function
function log(...text) {
    console.log(new Date().toLocaleString(), '|', ...text);
}

// Send Embed to Discord Channel
async function sendEmbed(title, description, colour, channelId) {
    const embed = new discord.EmbedBuilder()
        .setTitle(title || "Bot Message")
        .setDescription(description)
        .setColor(colour || 'Grey')
        .setTimestamp();

    try {
        const channel = await client.channels.fetch(channelId);
        await channel.send({ embeds: [embed] });
    } catch (err) {
        log("Error sending embed:", err.message);
    }
}

module.exports = { log, sendEmbed };
