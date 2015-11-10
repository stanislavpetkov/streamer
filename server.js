/**
 * Created by sunny on 15-10-25.
 */
"use strict";
var clc = require('cli-color');
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
    },
    "ffmpeg_to_thumb": {
        "app": "ffmpeg",
        "params": ['-re', '-y', '-i', 'http://localhost:8090/live.ts?fifo_size=1000000&overrun_nonfatal=1', '-vf','fps=5',"-vsync","vfr", "-s","97x55", '-f', 'image2', "-updatefirst","1", 'thumb.png'],
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



function args_toString(args) {
    if (args instanceof Object) {
        var text = "";
        for (var attr in args) {
            if (args.hasOwnProperty(attr)) text += stringify(args[attr]) + ' ';
        }

        return text.slice(0, text.length - 1);
    }
}

function stringify(data) {
    var text = "";

    // Handle the 3 simple types, and null or undefined
    if (null == data || "object" != typeof data) return data;

    // Handle Date
    if (data instanceof Date) {
        return data.toString(); //can change the format
    }


    // Handle Array
    if (data instanceof Array) {
        text = "";
        for (var i = 0, len = data.length; i < len; i++) {
            text += stringify(data[i]);
        }
        return text;
    }

    // Handle Object
    if (data instanceof Object) {
        text = "";
        for (var attr in data) {
            if (data.hasOwnProperty(attr)) text += '"' + attr + '":' + stringify(data[attr]) + ', ';
        }

        return text.slice(0, text.length - 2);
    }

    return data; //if there is something else
}


function doLog(text) {
    try {
        process.stdout.write(new Date().toISOString() + "\t" + text + "\n");
    } catch (e)
    {
        //do nothing
    }
}

function error() {
    doLog(clc.red("ERROR\t") + args_toString(arguments));
};

function warn() {
    doLog(clc.yellow("WARN\t") + args_toString(arguments));
};

function log() {
    doLog(clc.green("LOG\t") + args_toString(arguments));
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
    //log(req.session);
    var found = false;
    if ((req.session.sessKey)){

        for(var key in sessionStore) {
            var value = sessionStore[key];
            if (value.hasOwnProperty("sessKey")){
                if (req.session.sessKey == value.sessKey) {
                    //log("SessKey found");

                 /*
                    Session expiration
                    if((process.hrtime()[0] - value.lastUsed)>300){ //5minutes
                        clean(req);
                        delete req.session.sessKey;
                        res.redirect('/');
                        return;
                    }
                   */
                    found = true;
                    clean(req);
                    next();
                    break;
                }
            }
        }
        if (!found) {
            clean(req);
            delete req.session.sessKey;
            res.redirect('/');
        }

    } else
    {
        clean(req);
        delete req.session.sessKey;
        res.redirect('/');
    }


}

app.get('/',  function (req, res) {



    var html ="";

    html = "<html><head><meta charset=\"UTF-8\"><title>Streaming Server Login page</title><link rel=\"stylesheet\" href=\"main.css\"></head><body>";
    html += '<div class="container"><div class="main"><p><p>';
    html += '<div class="ca"><form action="/" method="post">Login <p><input type="text" name="userName" value="user"><br><input type="password" name="password" value="password"><br><br><button type="submit">Login</button></form></div>'
    html += '<div class="header"><h2>Streaming Server Monitoring</h2><span class="rar"></span></div>';
    html += '<div class="footer">Copyright (c) 2015 by 7bugs, developed by Stanislav Petkov</div></div></div></body></html>';


    res.send(html);


});


app.post('/', function(req, res){
    if (req.body.userName) {
        if (sessionStore.hasOwnProperty(req.body.userName))
        {
            var sess = sessionStore[req.body.userName];

            if (sess.password == req.body.password)
            {
               log("password is ok");
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
                "FFM_CDN": processes.ffmpeg_to_cdn.child.pid,
                "JAVASCRIPT": process.pid ,
                "FFM_THUMB": processes.ffmpeg_to_thumb.child.pid};

            res.writeHead(200, {"Content-Type": "application/json"});
            res.write(JSON.stringify(js));
            res.end();
        }
    });
});


app.get('/thumb.png', function(req,res){
    var data = fs.readFileSync("thumb.png");
    res.writeHead(200, {"Content-Type": "image/png", "Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"});

    res.write(data);
    res.end();
});

app.get('/reboot', restrict, function (req, res) {
    var proc = req.query.process;

    if ((proc == "") && (req.body.hasOwnProperty("process"))) {
        proc = req.body.enumName;
    }

    if (proc.toUpperCase() == "JAVASCRIPT")
    {
        process.exit(1);
        warn("rebooting SELF");
    }


    if (proc.toUpperCase() == "FFSERVER")
    {
        processes.ffserver.child.kill();
        warn("rebooting FFSERVER");
    }

    if (proc.toUpperCase() == "FFM_SOURCE")
    {
        processes.ffmpeg_from_udp.child.kill();
        warn("rebooting Source");
    }

    if (proc.toUpperCase() == "FFM_CDN")
    {
        processes.ffmpeg_to_cdn.child.kill();
        warn("rebooting CDN feed");
    }

    if (proc.toUpperCase() == "FFM_THUMB")
    {
        processes.ffmpeg_to_thumb.child.kill();
        warn("rebooting THUMB feed");
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
    log("Starting Server");
    processes.ffserver.child = spawn(processes.ffserver.app, processes.ffserver.params);


    processes.ffserver.child.stderr.on('data', function (data) {
        error('stderr: ' + data);
    });

    processes.ffserver.child.stdout.on('data', function (data) {

    });

    processes.ffserver.child.on('exit', function (code) {
        error('server child process exited with code ' + code);
        process.nextTick(runServer);
    });
}

function runFromSource() {
    if (stateExit) {
        return;
    }
    log("Starting Source to Server");
    processes.ffmpeg_from_udp.child = spawn(processes.ffmpeg_from_udp.app, processes.ffmpeg_from_udp.params);


    processes.ffmpeg_from_udp.child.stderr.on('data', function (data) {
           error('\n##################### ffmpeg_from_udp stderr - START\n' + data+ '\n##################### ffmpeg_from_udp stderr - END\n');
    });


    processes.ffmpeg_from_udp.child.stdout.on('data', function (data) {

            log('\n##################### ffmpeg_from_udp stdout - START\n' + data+ '\n##################### ffmpeg_from_udp stdout - END\n');

    });


    processes.ffmpeg_from_udp.child.on('exit', function (code) {
        error('stream to Server child process exited with code ' + code);
        process.nextTick(runFromSource);
    });
}

function runToCDN() {
    if (stateExit) {
        return;
    }
    log("Starting Server to CDN");
    processes.ffmpeg_to_cdn.child = spawn(processes.ffmpeg_to_cdn.app, processes.ffmpeg_to_cdn.params);


    processes.ffmpeg_to_cdn.child.stderr.on('data', function (data) {
        //console.log('stderr: ' + data);
    });

    processes.ffmpeg_to_cdn.child.on('exit', function (code) {
        error('stream to CDN child process exited with code ' + code);
        process.nextTick(runToCDN);
    });
}


function runThumb() {
    if (stateExit) {
        return;
    }
    log("Starting Thumbnail Generator");
    processes.ffmpeg_to_thumb.child = spawn(processes.ffmpeg_to_thumb.app, processes.ffmpeg_to_thumb.params);


    processes.ffmpeg_to_thumb.child.stderr.on('data', function (data) {
        //console.log('stderr: ' + data);
    });

    processes.ffmpeg_to_thumb.child.on('exit', function (code) {
        error('Thumbnail Generator process exited with code ' + code);
        process.nextTick(runThumb);
    });
}



runServer();
runFromSource();
runToCDN();
runThumb();

process.on('uncaughtException', function (err) {
    // handle the error safely
    error('Exception: ', err);
});

process.on('error', function (data) {
    error("Some Error :: ", data);
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
    if (processes.ffmpeg_to_thumb.child) {
        processes.ffmpeg_to_thumb.child.kill();
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
    if (processes.ffmpeg_to_thumb.child) {
        processes.ffmpeg_to_thumb.child.kill();
    }

    log('Got SIGINT.  ');
    process.exit(0);
});





app.listen(3000);
