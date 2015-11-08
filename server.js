/**
 * Created by sunny on 15-10-25.
 */
"use strict";

var request = require("request");

var express = require('express');
var bodyParser = require('body-parser'); // for reading POSTed form data into `req.body`
var expressSession = require('express-session');
var cookieParser = require('cookie-parser'); // the session is stored in a cookie, so we use this to parse it

var crypto = require('crypto');
var base64url = require('base64url');

var app = express();


var fs = require("fs");

var stateExit = false;

var appPath = require('path').dirname(Object.keys(require.cache)[0]);

console.log(appPath);


var processes = {
    "ffserver": {
        "app": "ffserver",
        "params": ['-f', appPath + '/' + 'ffserver.conf'],
        "child": null
    },

    "ffmpeg_from_udp": {
        "app": "ffmpeg",///home/sunny/WebstormProjects/streamServ/testrun.sh  
        "params": ['-re', '-y', '-v', '16', '-i', 'udp://0.0.0.0:1234?fifo_size=1000000&overrun_nonfatal=1', "-vf", "hqdn3d=1.5:1.5:6:6,unsharp=9:9:1.5:3:3:-0.1", '-f', 'ffm', 'http://localhost:8090/feed1.ffm?fifo_size=1000000&overrun_nonfatal=1'],
        "child": null
    },

    "ffmpeg_to_cdn": {
        "app": "ffmpeg",
        "params": ['-re', '-y', '-v','16','-i', 'http://localhost:8090/live.flv?fifo_size=1000000&overrun_nonfatal=1', '-c', 'copy', '-f', 'flv', 'rtmp://mu_varna:mU8Rn0104@pri.cdn.bg:2013/fls/test?fifo_size=1000000&overrun_nonfatal=1'],
        "child": null
    }
};

// must use cookieParser before expressSession
app.use(cookieParser());

app.use(expressSession({secret:'somesecrettokenhere',resave: true, saveUninitialized: true, proxy: true}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


var sessionStore = {
        admin: {password:"Administrator", sessKey:""},
        sunny: {password:"Administrator", sessKey:""}
};


function randomStringAsBase64Url(size) {
    return base64url(crypto.randomBytes(size));
}


function clean(req)
{
    delete req.session.userName;
    delete req.session.password;
}

function restrict(req, res, next) {
    console.log(req.session);
    if ((req.session.sessKey)){

        for(var key in sessionStore) {
            var value = sessionStore[key];
            if (value.hasOwnProperty("sessKey")){
                if (req.session.sessKey == value.sessKey) {
                    //console.log("SessKey found");

                 /*
                    Session expiration
                    if((process.hrtime()[0] - value.lastUsed)>300){ //5minutes
                        clean(req);
                        delete req.session.sessKey;
                        res.redirect('/');
                        return;
                    }
                   */

                    clean(req);
                    next();
                    break;
                } else {
                    clean(req);
                    delete req.session.sessKey;
                    res.redirect('/');
                    break;
                }
            }
            else {
                clean(req);
                delete req.session.sessKey;
                res.redirect('/');
                break;
            }
        }

    } else
    {
        clean(req);
        delete req.session.sessKey;
        res.redirect('/');
    }


}

app.get('/',  function (req, res) {
    var html = '<form action="/" method="post">' +
        'Your name: <input type="text" name="userName"><br>' +
        'Your pass: <input type="text" name="password"><br>'+
        '<button type="submit">Submit</button>' +
        '</form>';


    res.send(html);
});


app.post('/', function(req, res){
    if (req.body.userName) {
        if (sessionStore.hasOwnProperty(req.body.userName))
        {
            var sess = sessionStore[req.body.userName];
            //console.log(sess);
            //console.log(req.body);
            if (sess.password == req.body.password)
            {
                console.log("password is ok");
               clean(req);

                if (sess.sessKey!="")
                {
                    sess.sessKey = "";
                }
                sess.sessKey = randomStringAsBase64Url(64);
                sess.lastUsed = process.hrtime()[0]; //seconds since we start
                req.session.sessKey = sess.sessKey;
                res.redirect('/index.html');

            } else {
                delete req.session.sessKey;
                clean(req);
                res.redirect('/');
            }
        } else {
            delete req.session.sessKey;
            clean(req);
            res.redirect( '/');

        }
    }

});


app.get('/logout', function (req, res) {

    if ((req.session.sessKey)){

        for(var key in sessionStore) {
            var value = sessionStore[key];
            if (value.hasOwnProperty("sessKey")){
                if (req.session.sessKey == value.sessKey) {
                    clean(req);
                    value.sessKey = "";
                    break;
                }
            }
        }

    }
    res.redirect('/');
});





app.get('/index.html',restrict, function (req, res) {
    console.log("index-a ",req.body.sessKey);

    var data = fs.readFileSync("index.html");
    res.writeHead(200, {"Content-Type": "text/html"});
    res.write(data);
    res.end();
});

app.get('/main.css', function (req, res) {
    var data = fs.readFileSync("main.css");
    res.writeHead(200, {"Content-Type": "text/css"});
    res.write(data);
    res.end();
});


app.get('/data', restrict, function (req, res) {
    request('http://localhost:8090/stat.html', function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var js = JSON.parse(body);
            js.streamingUrl = 'http://'+req.socket.localAddress+':8090/';
            js.procs = {"FFSERVER": processes.ffserver.child.pid,
                "FFM_SOURCE": processes.ffmpeg_from_udp.child.pid,
                "FFM_CDN": processes.ffmpeg_to_cdn.child.pid};

            res.writeHead(200, {"Content-Type": "application/json"});
            res.write(JSON.stringify(js));
            res.end();
        }
    });
});


app.get('/reboot', restrict, function (req, res) {
    var proc = req.query.process;

    if ((proc == "") && (req.body.hasOwnProperty("process"))) {
        proc = req.body.enumName;
    }

    if (proc.toUpperCase() == "FFSERVER")
    {
        processes.ffserver.child.kill();
        console.log("rebooting FFSERVER");
    }

    if (proc.toUpperCase() == "FFM_SOURCE")
    {
        processes.ffmpeg_from_udp.child.kill();
        console.log("rebooting Source");
    }

    if (proc.toUpperCase() == "FFM_CDN")
    {
        processes.ffmpeg_to_cdn.child.kill();
        console.log("rebooting CDN feed");
    }
    res.writeHead(200, {"Content-Type": "application/json"});
    res.write(JSON.stringify({"error":"OK"}));

    res.end();
});


var spawn = require('child_process').spawn;

function runServer() {
    if (stateExit) {
        return;
    }
    console.log("Starting Server");
    processes.ffserver.child = spawn(processes.ffserver.app, processes.ffserver.params);


    processes.ffserver.child.stderr.on('data', function (data) {
        console.log('stderr: ' + data);
    });

    processes.ffserver.child.stdout.on('data', function (data) {
        //console.log('stdout: ' + data);
    });

    processes.ffserver.child.on('exit', function (code) {
        console.log('server child process exited with code ' + code);
        process.nextTick(runServer);
    });
}

function runFromSource() {
    if (stateExit) {
        return;
    }
    console.log("Starting Source to Server");
    processes.ffmpeg_from_udp.child = spawn(processes.ffmpeg_from_udp.app, processes.ffmpeg_from_udp.params);


    processes.ffmpeg_from_udp.child.stderr.on('data', function (data) {
           console.log('\n##################### ffmpeg_from_udp stderr - START\n' + data+ '\n##################### ffmpeg_from_udp stderr - END\n');
    });


    processes.ffmpeg_from_udp.child.stdout.on('data', function (data) {

            console.log('\n##################### ffmpeg_from_udp stdout - START\n' + data+ '\n##################### ffmpeg_from_udp stdout - END\n');

    });


    processes.ffmpeg_from_udp.child.on('exit', function (code) {
        console.log('stream to Server child process exited with code ' + code);
        process.nextTick(runFromSource);
    });
}

function runToCDN() {
    if (stateExit) {
        return;
    }
    console.log("Starting Server to CDN");
    processes.ffmpeg_to_cdn.child = spawn(processes.ffmpeg_to_cdn.app, processes.ffmpeg_to_cdn.params);


    processes.ffmpeg_to_cdn.child.stderr.on('data', function (data) {
        //console.log('stderr: ' + data);
    });

    processes.ffmpeg_to_cdn.child.on('exit', function (code) {
        console.log('stream to CDN child process exited with code ' + code);
        process.nextTick(runToCDN);
    });
}

runServer();
runFromSource();
runToCDN();

process.on('uncaughtException', function (err) {
    // handle the error safely
    console.log('Exception: ', err);
});

process.on('error', function (data) {
    console.log("Some Error :: ", data);
});


process.on('exit', function (data) {
    if (processes.ffserver.child) {
        processes.ffserver.child.kill();
    }
    if (processes.ffmpeg_to_cdn.child) {
        processes.ffmpeg_to_cdn.child.kill();
    }
    if (processes.ffmpeg_from_udp.child) {
        processes.ffmpeg_from_udp.child.kill();
    }

});

process.on('SIGINT', function () {
    stateExit = true;
    if (processes.ffserver.child) {
        processes.ffserver.child.kill();
    }
    if (processes.ffmpeg_to_cdn.child) {
        processes.ffmpeg_to_cdn.child.kill();
    }
    if (processes.ffmpeg_from_udp.child) {
        processes.ffmpeg_from_udp.child.kill();
    }

    console.log('Got SIGINT.  ');
    process.exit(0);
});





app.listen(3000);
