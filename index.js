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

const PlayerStatsMap = new SerializableMap();
const PlayerStatsMap_filename = 'playerstats.json';
if (fs.existsSync(PlayerStatsMap_filename))
{
    PlayerStatsMap.load_from_file(PlayerStatsMap_filename);
}

const pp_threshold = 2;
const limit = 50;

const server = 'http://osu.gatari.pw';

function updatePlayerStats(username, stream)
{
    const URL = server + '/api/v1/users/stats?u=' + username;
    request.get(URL,function (error, headers, data)
    {
        data = JSON.parse(data);

        if (!error && data && data.code === 200)
        {
            const stats = {pp:data.stats.pp, rank:data.stats.rank};

            if (!PlayerStatsMap.has(username))
            {
                PlayerStatsMap.add(username,stats);
            }
            else
            {
                const prevStats = PlayerStatsMap.get(username);
                const rankDelta = prevStats.rank - stats.rank;
                if (stats.pp - prevStats.pp >= pp_threshold)
                {
                    const URL2 = server + '/api/v1/users/privileges?u=' + username;
                    request.get(URL2,function (error, headers, data)
                    {
                        data = JSON.parse(data);

                        if (!error && data && data.code == 200)
                        {
                            if ((data.info.privileges & Math.pow(2,7)) > 0)
                            {
                                const userid = data.info.userid;

                                console.log('Druzhban privileges confirmed!');

                                const URL3 = server + '/api/v1/users/scores/best?id=' + userid + '&l='+limit+ '&p=1'+'&mode=0';

                                request.get(URL3,function (error, headers, data)
                                {
                                    data = JSON.parse(data);

                                    if (!error && data && (+data.code) === 200)
                                    {
                                        data = data.scores;
                                        data.forEach(function (x) {
                                            x.seconds = Math.floor((new Date() - new Date(x.time)) / 1000);
                                        });

                                        const newScoreDate = Math.min.apply(Math,data.map(function(o){return o.seconds;}));

                                        const index = data.findIndex(function (elem) {
                                            return elem.seconds === newScoreDate;
                                        });

                                        const newScore = data[index];

                                        const newScoreMessage = 'New score: #' + index + ' for ' + newScore.pp + 'pp on ' + newScore.beatmap.song_name + ' ' + rankDelta + ' ranks gained!';
                                        twitch_irc_client.say(stream, newScoreMessage);
                                    }
                                    else
                                        console.log('User best scores request error: ' + error);
                                });
                            }
                        }
                        else
                            console.log('User priveleges request error: ' + error);
                    });
                }
                PlayerStatsMap.add(username, stats);
                PlayerStatsMap.save_to_file(PlayerStatsMap_filename);
            }
        }
        else
            console.log('User stats request error: ' + error);
    });
}

function updatePlayersStats()
{
    StreamPlayerMap.forEach(function (value, key)
    {
        updatePlayerStats(value, key);
    });
}

setInterval(updatePlayersStats,10 * 1000);


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
                verificationMap.set(verificationCode, {'channel':arg.toLowerCase(),'player':from});
            });

            client.say(from,'Your verification code: ' + verificationCode + ' . Paste it into your twitch chat');
        	}
        }

        if (message.startsWith('!disconnect'))
        {
            const keys = [];

            StreamPlayerMap.forEach(
                function(value, key)
                {
                    if (value === from)
                    {
                        keys.push(key);
                    }
                });

            keys.forEach(function (v)
            {
                StreamPlayerMap.delete(v);
            })

            client.say(from,'Disconnected');
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

        if (user === pair.channel && channel === pair.channel)
        {
            StreamPlayerMap.add(pair.channel,pair.player);
            StreamPlayerMap.save_to_file(StreamPlayerMap_filename);

            client.say(pair.player, 'Connection success! Enjoy your Mikuia');

            verificationMap.delete(message);
        }
    }

    const BeatmapIdRegExp = /https?:\/\/(osu|new)\.(?:gatari|ppy)\.(?:pw|sh)\/([bs])\/(\d+)(\+(.+))?/i;

    //console.log(message);

    const player = StreamPlayerMap.has(channel) ? StreamPlayerMap.get(channel) : undefined;

    //console.log(player);
    const res2 = BeatmapIdRegExp.exec(message);
    if (res2 !== null && user != channel)
    {
        console.log('Got beatmap request! ' + res2[0]);

        const beatmapId = res2[3];
        const mods = res2[5];

        const mapInfoCallback = function(beatmapInfo)
        {
            const ircMessage = user + ' -> ' + '[' + 'https://osu.ppy.sh/' + res2[2] +  '/' + beatmapId + ' ' + beatmapInfo + ']' + (mods != undefined ? '+' + mods : "");
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

        if (res2[2] === 'b')
            getMapInfoFromApi(beatmapId,mapInfoCallback);
        else
            getMapSetInfoFromApi(beatmapId,mapInfoCallback);
    }
});

