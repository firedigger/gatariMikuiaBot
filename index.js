const irc = require('irc');

const fs = require('fs');
const config = JSON.parse(fs.readFileSync('config.json'));
const request = require('request');
const osuApi_lib = require('./osu_api');
const osuApi = new osuApi_lib.Api(config.apiKey);

const SerializableMap = require('./SerializableMap');

//const channel = 'firedigger';

const StreamPlayerMap = new SerializableMap();
const StreamPlayerMap_filename = 'streamplayermap.json';
if (fs.existsSync(StreamPlayerMap_filename))
{
    StreamPlayerMap.load_from_file(StreamPlayerMap_filename);
}

const twitch_config = JSON.parse(fs.readFileSync('twitch_config.json'));
//twitch_config.host = channels;

const channels = [];

StreamPlayerMap.forEach(function (value, key) {
    channels.push('#' + key);
});

twitch_config.channels = channels;

const twitch_irc_client_lib = require('./twitch_irc');
const twitch_irc_client = new twitch_irc_client_lib(twitch_config);

twitch_irc_client.connect(function () {
    /*setInterval(function () {
     online_users.forEach(function(username) {
     currency_holder.update_currency(username,coins_period_value);
     });
     },coins_period_seconds * 1000);*/
    console.log('connected to twitch');
    /*twitch_irc_client.get_mods(function (res) {
        mods_list = res;
        mods_list.push(twitch_config.host);
        mods_list.push('firedigger');
    });*/
});

const verificationMap = new Map();

const username = 'Mikuia';
const irc_password = config.token;

const client = new irc.Client('93.170.76.141', username, {
    userName: username,
    password: irc_password,
    showErrors: true,
    floodProtection: true,
    floodProtectionDelay: 2000,
    autoConnect: false
});

client.addListener('connect',function () {
    console.log('irc connected');
});

client.addListener('pm',function (from, message)
{
    try
    {
        if (message.startsWith('!connect'))
        {
            const arg = message.split(' ')[1];
            if(!StreamPlayerMap.has(arg)){
            const verificationCode = Math.random().toString(36).substr(2, 5);

            twitch_irc_client.client.join(arg).then(function () {
                verificationMap.set(verificationCode, {'channel':arg,'player':from});
            });

            client.say(from,'Your verification code: ' + verificationCode + ' . Paste it into your twitch chat');
        	}
        }
    } catch (e)
    {
        console.log(e);
    }
});

client.addListener('error',function (error) {
    console.log(error);
});

client.connect(1);

function getMapInfoFromApi(beatmap_id,callback)
{
    osuApi.getBeatmap(beatmap_id,function (error, metadata) {

        if (Array.isArray(metadata))
            metadata = metadata[0];

        if (metadata)
        {
            const mapInfo = metadata.artist + ' - ' + metadata.title + '[' + metadata.version + ']';
            callback(mapInfo);
        }
		else
		{
			console.log('Error retrieving beatmap data ' + beatmap_id);
		}
    });
}

function getMapSetInfoFromApi(beatmapset_id,callback)
{
    osuApi.getBeatmapSet(beatmapset_id,function (error, metadata) {

        if (Array.isArray(metadata))
            metadata = metadata[0];

        if (metadata)
        {
            const mapInfo = metadata.artist + ' - ' + metadata.title;
            callback(mapInfo);
        }
		else
		{
			console.log('Error retrieving beatmap data ' + beatmapset_id);
		}
    });
}

/*request.get('http://93.170.76.141:5002/api/v1/pp?b={}&m={}', function (error, header, data) {
 let mapInfo = data.song_name + ' ' + data.difficulty;*/

twitch_irc_client.on_message(function(channel, user,message,callback,whisper_callback)
{

    //console.log(verificationMap.has(message));

    if (verificationMap.has(message))
    {
        const pair = verificationMap.get(message);

        if (user == pair.channel && channel == pair.channel)
        {
            StreamPlayerMap.add(pair.channel,pair.player);
            StreamPlayerMap.save_to_file(StreamPlayerMap_filename);

            client.say(pair.player, 'Connection success! Enjoy your Mikuia');

            verificationMap.delete(message);
        }
    }

    const BeatmapIdRegExp = /https?:\/\/(osu|new)\.ppy\.sh\/([bs])\/(\d+)(\+(.+))?/i;

    //console.log(message);

    const player = StreamPlayerMap.has(channel) ? StreamPlayerMap.get(channel) : undefined;

    //console.log(player);

    const res2 = BeatmapIdRegExp.exec(message);
    if (res2 != null)
    {
        console.log('Got beatmap request! ' + res2[0]);

        const beatmapId = res2[3];
        const mods = res2[5];

        const mapInfoCallback = function(beatmapInfo)
        {
            const ircMessage = user + ' -> ' + '[' + 'https://osu.ppy.sh/b/' + beatmapId + ' ' + beatmapInfo + ']' + (mods != undefined ? '+' + mods : "");
            console.log(ircMessage);
            twitch_irc_client.say(channel,"[~Requested!~]\n  "+beatmapInfo)
            if (player)
			{
				console.log('Attempting to send message to ' + player + ' ' + ircMessage);
                client.say(player, ircMessage);
			}
			else
			{
				console.log('Channel ' + channel + ' didnt find user');
			}
        };

        if (res2[2] == 'b')
            getMapInfoFromApi(beatmapId,mapInfoCallback);
        else
            getMapSetInfoFromApi(beatmapId,mapInfoCallback);
    }
});

