/**
 * Created by sunny on 15-10-25.
 */
"use strict";

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

var connections = {};


var processes = {
    "ffmpeg_from_udp": {
        "app": "/usr/local/bin/ffmpeg",
        "params": ['-y', '-v', '16', '-i', 'udp://172.16.57.4:10001?fifo_size=10000000&overrun_nonfatal=1', '-c:v', 'copy', '-c:a', 'libfaac', '-b:a', '128K', '-f', 'hls', '-hls_flags', 'delete_segments', '-hls_time', '10', '-metadata', 'encoder=SUNNY', '-metadata', 'service_name=MU-VI.TV', '-metadata', 'service_provider="Streamer Service"', '-hls_base_url', '/', 'hls/playlist.m3u8', '-f', 'mpegts', 'udp://127.0.0.1:4568?fifo_size=10000000'],
        "child": null
    },

    "ffmpeg_to_cdn": {
        "app": "/usr/local/bin/ffmpeg",
        "params": ['-y', '-v', '16', '-i', 'udp://172.16.57.4:10002?fifo_size=10000000&overrun_nonfatal=1', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128K', '-metadata', 'encoder=SUNNY', '-metadata', 'service_name=MU-VI.TV', '-metadata', 'service_provider="Streamer Service"', '-f', 'flv', 'rtmp://mu_varna:mU8Rn0104@85.14.24.36:2013/fls/livetv.stream?rtmp_live=live&fifo_size=10000000', '-f', 'mpegts', 'udp://127.0.0.1:4567?fifo_size=10000000'],
        "child": null
    },
    "ffmpeg_to_thumb": {
        "app": "/usr/local/bin/ffmpeg",
        "params": ['-y', '-i', 'udp://127.0.0.1:4568?fifo_size=10000000&overrun_nonfatal=1', '-vf', 'fps=5', "-vsync", "vfr", "-s", "426x240", '-an', '-f', 'image2', "-q:v", "2", "-updatefirst", "1", 'hls/thumb.jpg'],
        "child": null
    },
    "ffmpeg_to_thumb1": {
        "app": "/usr/local/bin/ffmpeg",
        "params": ['-y', '-i', 'udp://127.0.0.1:4567?fifo_size=10000000&overrun_nonfatal=1', '-vf', 'fps=5', "-vsync", "vfr", "-s", "426x240", '-an', '-f', 'image2', "-q:v", "2", "-updatefirst", "1", 'hls/thumb_rmt.jpg'],
        "child": null
    },


};

// must use cookieParser before expressSession
app.use(cookieParser());

app.use(expressSession({secret: 'somesecrettokenhere', resave: true, saveUninitialized: true, proxy: true}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));


var sessionStore = {
    admin: {password: "Administrator", sessKey: ""},
    sunny: {password: "St@nislav78", sessKey: ""}
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
        process.stdout.write(text + "\n");
    } catch (e) {
        //do nothing
    }
}

function error() {
    doLog("[ERROR] :: " + args_toString(arguments));
};

function warn() {
    doLog("[WARN] :: " + args_toString(arguments));
};

function log() {
    doLog("[LOG] :: " + args_toString(arguments));
};

function randomStringAsBase64Url(size) {
    return base64url(crypto.randomBytes(size));
}


function clean(req) {
    delete req.session.userName;
    delete req.session.password;
}

function restrict(req, res, next) {
    //log(req.session);
    var found = false;
    if ((req.session.sessKey)) {

        for (var key in sessionStore) {
            var value = sessionStore[key];
            if (value.hasOwnProperty("sessKey")) {
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

    } else {
        clean(req);
        delete req.session.sessKey;
        res.redirect('/');
    }


}

app.get('/playlist.m3u8', function (req, response) {


    fs.readFile("hls/playlist.m3u8", function (err, data) {
        if (err) {
            response.writeHead(404, {"Content-Type": "text/plain"});
            response.end("file not found");
            return;
        }

        response.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
        var forwardedIpsStr = req.header('x-forwarded-for');
        response.end(data);


        if (connections.hasOwnProperty(forwardedIpsStr)) {
            connections[forwardedIpsStr].requestCount++;
            connections[forwardedIpsStr].ip = forwardedIpsStr;
            connections[forwardedIpsStr].time = new Date();
        }
        else {
            connections[forwardedIpsStr] = {};
            connections[forwardedIpsStr].requestCount = 1;
            connections[forwardedIpsStr].ip = forwardedIpsStr;
            connections[forwardedIpsStr].time = new Date();
        }

    });
});

app.get('/', function (req, res) {


    var html = "";

    html = "<html><head><meta charset=\"UTF-8\"><title>Streaming Server Login page</title><link rel=\"stylesheet\" href=\"main.css\"></head><body>";
    html += '<div class="container"><div class="main"><p><p>';
    html += '<div class="ca"><form action="/" method="post">Login <p><input type="text" name="userName" value="user"><br><input type="password" name="password" value="password"><br><br><button type="submit">Login</button></form></div>'
    html += '<div class="header"><h2>Streaming Server Monitoring</h2><span class="rar"></span></div>';
    html += '<div class="footer">Copyright (c) 2015 by 7bugs, developed by Stanislav Petkov</div></div></div></body></html>';


    res.send(html);


});


app.post('/', function (req, res) {
    if (req.body.userName) {
        if (sessionStore.hasOwnProperty(req.body.userName)) {
            var sess = sessionStore[req.body.userName];

            if (sess.password == req.body.password) {
                log("password is ok");
                clean(req);

                if (sess.sessKey != "") {
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
            res.redirect('/');

        }
    }

});


app.get('/logout', function (req, res) {

    if ((req.session.sessKey)) {

        for (var key in sessionStore) {
            var value = sessionStore[key];
            if (value.hasOwnProperty("sessKey")) {
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


app.get('/index.html', restrict, function (req, res) {
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
    var js = {};//JSON.parse(body);
    js.streamingUrl = 'http://' + req.socket.localAddress + ':8090/playlist.m3u8';
    js.procs = {
        "FFM_SOURCE": processes.ffmpeg_from_udp.child.pid,
        "FFM_CDN": processes.ffmpeg_to_cdn.child.pid,
        "JAVASCRIPT": process.pid,
        "FFM_THUMB": processes.ffmpeg_to_thumb.child.pid,
        "FFM_THUMB1": processes.ffmpeg_to_thumb1.child.pid
    };


    js.connections = connections;

    res.writeHead(200, {"Content-Type": "application/json"});
    res.write(JSON.stringify(js));
    res.end();
    //  }
    // });
});


app.get('/thumb.jpg', function (req, response) {
    fs.readFile("hls/thumb.jpg", function (err, data) {
        if (err) {
            response.writeHead(404, {"Content-Type": "text/plain"});
            response.end("file not found");
            return;
        }

        response.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        });
        response.end(data);
    });

});

app.get('/thumb1.jpg', function (req, response) {
    fs.readFile("hls/thumb_rmt.jpg", function (err, data) {
        if (err) {
            response.writeHead(404, {"Content-Type": "text/plain"});
            response.end("file not found");
            return;
        }

        response.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        });
        response.end(data);
    });

});


app.get('/reboot', restrict, function (req, res) {
    var proc = req.query.process;

    if ((proc == "") && (req.body.hasOwnProperty("process"))) {
        proc = req.body.enumName;
    }

    if (proc.toUpperCase() == "JAVASCRIPT") {
        process.exit(1);
        warn("rebooting SELF");
    }


    if (proc.toUpperCase() == "FFM_SOURCE") {
        processes.ffmpeg_from_udp.child.kill();
        warn("rebooting Source");
    }

    if (proc.toUpperCase() == "FFM_CDN") {
        processes.ffmpeg_to_cdn.child.kill();
        warn("rebooting CDN feed");
    }

    if (proc.toUpperCase() == "FFM_THUMB") {
        processes.ffmpeg_to_thumb.child.kill();
        warn("rebooting THUMB feed");
    }


    if (proc.toUpperCase() == "FFM_THUMB1") {
        processes.ffmpeg_to_thumb1.child.kill();
        warn("rebooting THUMB1 feed");
    }

    res.writeHead(200, {"Content-Type": "application/json"});
    res.write(JSON.stringify({"error": "OK"}));

    res.end();
});


var spawn = require('child_process').spawn;


function runFromSource() {
    if (stateExit) {
        return;
    }
    log("Starting Source to Server");
    processes.ffmpeg_from_udp.child = spawn(processes.ffmpeg_from_udp.app, processes.ffmpeg_from_udp.params);


    processes.ffmpeg_from_udp.child.stderr.on('data', function (data) {
        error('\n##################### ffmpeg_from_udp stderr - START\n' + data + '\n##################### ffmpeg_from_udp stderr - END\n');
    });


    processes.ffmpeg_from_udp.child.stdout.on('data', function (data) {

        log('\n##################### ffmpeg_from_udp stdout - START\n' + data + '\n##################### ffmpeg_from_udp stdout - END\n');

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
    fs.appendFileSync("cdnLogFile.log", new Date().toISOString() + "\tStarting\n");
    processes.ffmpeg_to_cdn.child = spawn(processes.ffmpeg_to_cdn.app, processes.ffmpeg_to_cdn.params);


    processes.ffmpeg_to_cdn.child.stderr.on('data', function (data) {
        error('TO CDN stderr: ' + data);
//	fs.appendFileSync("cdnLogFile.log", new Date().toISOString() + "\t"+data+"\n");
    });

    processes.ffmpeg_to_cdn.child.on('exit', function (code) {
        error('stream to CDN child process exited with code ' + code);
        //fs.appendFileSync("cdnLogFile.log", new Date().toISOString() + "\tTo CDN Exiting::: "+code+"\n");
//        process.nextTick(runToCDN);
        setTimeout(runToCDN, 3000);
    });
}

function removeHLSFiles() {
    var files = fs.readdirSync('./hls/');

    for (var i = 0; i < files.length; i++) {

        var stats = fs.statSync('./hls/' + files[i]);
        if (stats.isFile()) {
            log("Deleting:: " + './hls/' + files[i]);
            fs.unlinkSync('./hls/' + files[i]);
        }
    }
}


function runThumb() {
    if (stateExit) {
        return;
    }
    log("Starting Thumbnail Generator");
    processes.ffmpeg_to_thumb.child = spawn(processes.ffmpeg_to_thumb.app, processes.ffmpeg_to_thumb.params);


    processes.ffmpeg_to_thumb.child.stderr.on('data', function (data) {
        //error('Thumbnail Generator Error: ' + data);
    });

    processes.ffmpeg_to_thumb.child.on('exit', function (code) {
        error('Thumbnail Generator process exited with code ' + code);
//        process.nextTick(runThumb);
        setTimeout(runThumb, 2000);
    });
}


function runThumb1() {
    if (stateExit) {
        return;
    }
    log("Starting Thumbnail Generator 2");
    processes.ffmpeg_to_thumb1.child = spawn(processes.ffmpeg_to_thumb1.app, processes.ffmpeg_to_thumb1.params);


    processes.ffmpeg_to_thumb1.child.stderr.on('data', function (data) {
        //error('Thumbnail Generator CDN Error: ' + data);
    });

    processes.ffmpeg_to_thumb1.child.on('exit', function (code) {
        error('Thumbnail Generator 2 process exited with code ' + code);
//        process.nextTick(runThumb);
        setTimeout(runThumb1, 2000);
    });
}


removeHLSFiles();
runFromSource();
runToCDN();
runThumb();
runThumb1();

process.on('uncaughtException', function (err) {
    // handle the error safely
    error('Exception: ', err);
});

process.on('error', function (data) {
    error("Some Error :: ", data);
});


process.on('exit', function (data) {

    if (processes.ffmpeg_to_cdn.child) {
        processes.ffmpeg_to_cdn.child.kill();
    }
    if (processes.ffmpeg_from_udp.child) {
        processes.ffmpeg_from_udp.child.kill();
    }
    if (processes.ffmpeg_to_thumb.child) {
        processes.ffmpeg_to_thumb.child.kill();
    }

    if (processes.ffmpeg_to_thumb1.child) {
        processes.ffmpeg_to_thumb1.child.kill();
    }


});

process.on('SIGINT', function () {
    stateExit = true;
    if (processes.ffmpeg_to_cdn.child) {
        processes.ffmpeg_to_cdn.child.kill();
    }
    if (processes.ffmpeg_from_udp.child) {
        processes.ffmpeg_from_udp.child.kill();
    }
    if (processes.ffmpeg_to_thumb.child) {
        processes.ffmpeg_to_thumb.child.kill();
    }

    if (processes.ffmpeg_to_thumb1.child) {
        processes.ffmpeg_to_thumb1.child.kill();
    }

    error('Got SIGINT.  ');
    process.exit(0);
});


error('NOT AN ERROR: STREAMER STARTED');
app.listen(3000);
