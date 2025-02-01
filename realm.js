const AF = require('prismarine-auth');
const bedrock = require('bedrock-protocol');
const fs = require('fs');
const uuid = require('uuid');
const config = require('./config.json');
const { log, sendEmbed } = require('./utils');

const players = new Map();
const realmClients = new Map();
const packetCounts = new Map();

// Utility: Increment packet count for a player
function incrementPacketCount(username, type) {
    if (!packetCounts.has(username)) {
        packetCounts.set(username, { count: 1, firstPacketTime: Date.now(), badPackets: 0 });
    } else {
        const packetInfo = packetCounts.get(username);
        packetInfo.count++;
        if (type === 'bad') packetInfo.badPackets++;
        packetCounts.set(username, packetInfo);
    }
}

// Utility: Reset packet count
function resetPacketCount(username) {
    packetCounts.delete(username);
}

// Utility: Send a command to the Minecraft server
function sendCmd(client, ...cmds) {
    cmds.forEach((cmd) => {
        try {
            client.write('command_request', {
                command: cmd,
                origin: { type: 'player', uuid: uuid.v4(), request_id: uuid.v4() },
                internal: true,
                version: 52,
            });
        } catch (err) {
            log(`Error sending command: ${err.message}`);
        }
    });
}

// Function: Spawn bot for a specific realm
async function spawnBot(realm) {
    const authFlow = new AF.Authflow(config.username, './accounts', {
        authTitle: AF.Titles.MinecraftNintendoSwitch,
        deviceType: 'Nintendo',
        flow: 'live',
    });

    const client = bedrock.createClient({
        username: config.username,
        profilesFolder: './accounts',
        realms: { realmInvite: realm.realmCode },
        conLog: log,
    });

    realmClients.set(realm.realmCode, client);

    // Event: Handle player list updates
    client.on('player_list', (packet) => {
        packet.records.records.forEach((player) => {
            const username = player.username;
            const os = player.build_platform;

            // Skip checks for whitelisted users
            if (config.whitelist.includes(username)) {
                log(`Whitelisted user: ${username}`);
                return;
            }

            // Anti-device spoofing
            if (!['', ''].includes(os)) {
                log(`Kicking ${username} for device spoofing (${os})`);
                sendCmd(client, `/kick "${username}" Device Spoofing Detected`);
            }

            // Anti-SSBPS
            incrementPacketCount(username, 'normal');
            const packetInfo = packetCounts.get(username);
            if (packetInfo.badPackets > 10) {
                log(`Kicking ${username} for malformed packets`);
                sendCmd(client, `/kick "${username}" Malformed Packets Detected`);
            }
        });
    });

    // Event: Relay Minecraft chat to Discord
    client.on('text', (packet) => {
        if (!packet.needs_translation && packet.type === 'chat') {
            const message = `${packet.source_name}: ${packet.message}`;
            sendEmbed('Minecraft Chat', message, 'Grey', realm.logChannels.chat);
            log(`Relayed to Discord: ${message}`);
        }
    });

    // Event: Log errors
    client.on('error', (err) => {
        log(`Bot error: ${err.message}`);
    });

    client.on('kick', (reason) => {
        log(`Bot was kicked: ${reason}`);
    });
}

// Function: Relay Discord messages to Minecraft
function relayMessageFromDiscordToMinecraft(message) {
    const realm = config.realms[0]; // Use the first realm for simplicity
    const realmClient = realmClients.get(realm.realmCode);

    if (!realmClient) {
        log(`No client available for realm: ${realm.realmName}`);
        return;
    }

    try {
        const chatMessage = `[Discord] ${message.author.username}: ${message.content}`;
        realmClient.write('chat', { message: chatMessage });
        log(`Relayed to Minecraft: ${chatMessage}`);
    } catch (err) {
        log(`Error relaying to Minecraft: ${err.message}`);
    }
}

module.exports = { spawnBot, relayMessageFromDiscordToMinecraft };
