#!/usr/bin/env node

/**
 * Module dependencies.
 */

var express = require('express'),
    routes = require('./routes'),
    https = require('https'),
    oauth = require('oauth'),
    sys = require('sys'),
    TwitOauth = new oauth.OAuth(
        "https://twitter.com/oauth/request_token",
        "https://twitter.com/oauth/access_token",
        "ifD7XMhxpYmCgHiFfojA",
        "vHfNaioLPmCxKXeDFg1vhqTUfzoT6YUkEc86f9L4",
        "1.0A",
        "http://tweetchance.jit.su/twittercallback",
        "HMAC-SHA1"),

    db = require('mongojs').connect('mongodb://nodejitsu:1e8309a6e1163c993cbed80ae611408d@staff.mongohq.com:10094/nodejitsudb540146368257', ['users']),
    betable = require('./betable-oauth-node-sdk')({
          apiKey      : '231b3nNmKOlmYestXHc01Yfo91BHKsxp'
        , apiSecret   : 'DZ7a3HbmtTtEEHPX7DdKCdht2EGCMbKG'
        , redirectUri : 'http://tweetchance.jit.su/callback'
    }),

    BetableSDK = require('./betable-browser-sdk/betable-browser-sdk'),

    Twitter = require('twitter');


var app = module.exports = express.createServer();

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.bodyParser());
  app.use(express.cookieParser());
  app.use(express.session({ secret: "tweetchanceyouknowit" }));
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

var twit = new Twitter({
    consumer_key: 'ifD7XMhxpYmCgHiFfojA',
    consumer_secret: 'vHfNaioLPmCxKXeDFg1vhqTUfzoT6YUkEc86f9L4',
    access_token_key: '721503199-1ANJNF7jb3xfAGFnpI3V8B4c3k28oKnV30eyuG8u',
    access_token_secret: 'cQ54ACNT8WNsMf30JfglyYoSTFuDibya4aS7mjzeZY'
});

function postBet(betData, token, gameID, callback) {
    // Build the post string from an object
    var post_data = JSON.stringify(betData);

    console.log('token is ' + token);

    // An object of options to indicate where to post to
    var post_options = {
        host: 'api.betable.com',
        path: '/1.0/games/' + gameID + '/bet?access_token=' + token,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf8',
            'Content-Length': post_data.length
        }
    };

    // Set up the request
    var post_req = https.request(post_options, function(res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            console.log('Response: ' + chunk);
            chunk = JSON.parse(chunk);
            callback(chunk);
        });
    });

    // post the data
    post_req.write(post_data);
    post_req.end();

}

function usageTweet(username) {

    // Respond with usage
    var status = '@' + username + ' sorry, I don\'t understand. Please use the words \'bet X on Y\'';
    console.log(status);

    twit.updateStatus(status, function(data) {
        if(data.statusCode === 403) {
            console.log(data);
        }
    });
}

function trim(str) {
    return str.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
}

twit.stream('user', function(stream) {
    stream.on('data', function(data) {

        // Parse out the user info
        if(data.user) {
            var text = data.text;
            var username = data.user.screen_name;

            // Skip yourself
            if(username !== 'tweet_chance') {

                // Find user
                db.users.findOne({'username':username}, function(error, user) {
                    if(user !== null && typeof user !== 'undefined') {

                        // Parse out the bet request
                        var words = text.split(' ');
                        if(words.length < 5) {
                            console.log(words);

                            // Respond with usage
                            usageTweet(username);
                        } else {
                            var verb = words[1];
                            var wager = words[2];
                            var numbers = words.slice(4).join(' ');

                            if(verb !== 'bet') {
                                // Respond with usage
                                console.log(verb);
                                usageTweet(username);
                            } else {

                                // Check wager for valid values
                                var decNum = parseFloat(wager);
                                if(decNum === NaN) {
                                    decNum = parseInt(wager);

                                    if(decNum === NaN) {
                                        console.log('Can\'t parse wager ' + wager);
                                        wager = "1.00";
                                    } else {
                                        if(decNum > 1) {
                                            wager = "1.00";
                                        }
                                    }
                                } else {
                                    if(decNum > 1.0) {
                                        wager = "1.00";
                                    } else {
                                        wager = decNum.toFixed(2).toString();
                                    }
                                }
                                console.log(wager);

                                // Check to see if the numbers is 'even' or 'odd'
                                var numbersArr = [];
                                if(numbers === 'even') {
                                    numbersArr.push(2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36);
                                } else if(numbers === 'odd') {
                                    numbersArr.push(1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35,37);
                                } else if(numbers === 'red') {
                                    numbersArr.push(1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36);
                                } else if(numbers === 'black') {
                                    numbersArr.push(2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35,37);
                                } else {

                                    // See if it's more than 1 number
                                    var manyNums = numbers.split(',');
                                    console.log(manyNums);
                                    if(manyNums.length > 1) {
                                      for(var i in manyNums) {

                                          var potentialNum = manyNums[i];

                                          // Clear out whitespace
                                          potentialNum = trim(potentialNum);

                                          // Try to parse as number
                                          var num = parseInt(potentialNum);
                                          if(num !== NaN) {
                                              numbersArr.push(num);
                                          } else {
                                              console.log('Cannot parse ' + potentialNum);
                                          }
                                      }
                                    } else {

                                        // Just one number. Convert number from string to number
                                        var num = parseInt(numbers);
                                        if(num !== NaN) {
                                            numbersArr.push(num);
                                        } else {
                                            console.log('Cannot parse ' + numbers);
                                        }
                                    }
                                }

                                console.log(numbers);
                                console.log(numbersArr);

                                // Place a bet!
                                var bet_obj = {
                                    "wagers": [
                                        //{"wager": "1.00", numbers: [2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36]} //even bet
                                        { "wager": wager, numbers: numbersArr }
                                    ],
                                    currency : 'GBP',
                                    economy  : 'sandbox'
                                };

                                console.log(bet_obj);
                                postBet(bet_obj, user.token, '2W9E9FLp--Zaqi9JxtB0D3', function(data) {

                                    // Response looks like: {"payout":"0.00","outcome":0,"outcomes":[{"outcome":"lose","payout":"0.00","numbers":[35]}],"currency":"GBP"}
                                    // {"payout":"2.00","outcome":6,"outcomes":[{"outcome":"win","payout":"2.00","numbers":[2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36]}],"currency":"GBP"}

                                    // Check bet result
                                    console.log(data);

                                    // Check for errors
                                    if(data.error) {
                                        if(data.error === 'insufficient_funds') {
                                            var status = '@' + username + ' sorry, it appears you need more funds in your account. Go to betable.com to fill up.';
                                            console.log(status);

                                            twit.updateStatus(status, function(data) {
                                                if(data.statusCode === 403) {
                                                    console.log(data);
                                                }
                                            });
                                        } else if(data.error === 'bad_request') {
                                            var status = '@' + username + ' sorry, there was an error: ' + data.description;
                                            console.log(status);

                                            twit.updateStatus(status, function(data) {
                                                if(data.statusCode === 403) {
                                                    console.log(data);
                                                }
                                            });
                                        } else {
                                            var status = '@' + username + ' sorry, there was an error: ' + data.error;
                                            console.log(status);

                                            twit.updateStatus(status, function(data) {
                                                if(data.statusCode === 403) {
                                                    console.log(data);
                                                }
                                            });
                                        }
                                    } else {
                                        var outcome = data.outcomes[0].outcome;
                                        var number = data.outcome;
                                        var replyStart = 'congrats';
                                        if(outcome === 'lose') {
                                            replyStart = 'sorry';
                                        } else {
                                            // Add the winnings
                                            outcome += ' ' + data.outcomes[0].payout + ' ' + data.currency;
                                        }

                                        var status = '@' + username + ' ' + replyStart + '! The number was ' + number + '. You ' + outcome;
                                        console.log(status);

                                        twit.updateStatus(status, function(data) {
                                            if(data.statusCode === 403) {
                                                console.log(data);
                                            }
                                        });
                                    }
                                });
                            }
                        }
                    } else {
                        // Can't find user, tell them to auth
                        var status = '@' + username + ' you aren\'t a registered user. Please register at http://tweetchance.jit.su';
                        console.log(status);

                        twit.updateStatus(status, function(data) {
                            if(data.statusCode === 403) {
                                console.log(data);
                            }
                        });
                    }
                });
            }
        }
    });
});

// Routes

app.get('/', function(req, res) {
    res.render('index', {'layout':false});
});

app.get('/start', function(req, res) {
    if( !req.session.access_token ) {
        req.session.state = Math.floor( Math.random() * 1100000000000 ).toString()
        return betable.authorize( res, req.session.state )
    } else {
        // Now get the twitter handle
        TwitOauth.getOAuthRequestToken(function(error, oauthToken, oauthTokenSecret, results){
            if (error) {
                res.send("Error getting OAuth request token : " + sys.inspect(error), 500);
            } else {
                console.log(oauthToken);
                req.session.oauthRequestToken = oauthToken;
                req.session.oauthRequestTokenSecret = oauthTokenSecret;
                res.redirect("https://twitter.com/oauth/authorize?oauth_token="+req.session.oauthRequestToken);
            }
        });
    }
});

app.get('/callback', function(req, res) {
    var code  = req.query.code;

    if( req.query.error ) {
        return res.send( 'we got an error', req.query.error );
    }

    betable.token( code, function( error, access_token ) {
        if( error ) return res.send( { error: error }, 400 )

        req.session.access_token = access_token;
        console.log(access_token);

        // Now get the twitter handle
        TwitOauth.getOAuthRequestToken(function(error, oauthToken, oauthTokenSecret, results){
            if (error) {
                res.send("Error getting OAuth request token : " + sys.inspect(error), 500);
            } else {
                console.log(oauthToken);
                req.session.oauthRequestToken = oauthToken;
                req.session.oauthRequestTokenSecret = oauthTokenSecret;
                res.redirect("https://twitter.com/oauth/authorize?oauth_token="+req.session.oauthRequestToken);
            }
        });
    })
});

app.get('/twittercallback', function(req, res){
    sys.puts(">>"+req.session.oauthRequestToken);
    sys.puts(">>"+req.session.oauthRequestTokenSecret);
    sys.puts(">>"+req.query.oauth_verifier);

    TwitOauth.getOAuthAccessToken(req.session.oauthRequestToken, req.session.oauthRequestTokenSecret, req.query.oauth_verifier, function(error, oauthAccessToken, oauthAccessTokenSecret, results) {
        if (error) {
            res.send("Error getting OAuth access token : " + sys.inspect(error) + "["+oauthAccessToken+"]"+ "["+oauthAccessTokenSecret+"]"+ "["+sys.inspect(results)+"]", 500);
        } else {
            req.session.oauthAccessToken = oauthAccessToken;
            req.session.oauthAccessTokenSecret = oauthAccessTokenSecret;

            // Get the user info
            TwitOauth.get("http://twitter.com/account/verify_credentials.json", req.session.oauthAccessToken, req.session.oauthAccessTokenSecret, function (error, data, response) {
                if (error) {
                    res.send("Error getting twitter screen name : " + sys.inspect(error), 500);
                } else {
                    data = JSON.parse(data);
                    req.session.twitterScreenName = data["screen_name"];
                    console.log('You are signed in: ' + req.session.twitterScreenName);

                    db.users.update({'token':req.session.access_token}, {$set:{ 'username':data["screen_name"] }}, {safe:true, upsert:true}, function(err) {
                        // Now get the twitter handle
                        return res.redirect('http://twitter.com');
                    });
                }
            });
        }
    });
});

app.get('/clear', function(req, res){

    db.users.remove(function(err) {
        // Now get the twitter handle
        res.send('You a stone cold muthafucka');
    });
});


app.listen(8080);

app.on('listening', function () {
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});

