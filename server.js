/**
 * Created by sunny on 15-10-25.
 */
"use strict";
var express = require('express');
var app = express();
var request = require("request");
var bodyParser = require("body-parser");


var fs = require("fs");

var stateExit = false;

var appPath = require('path').dirname(Object.keys(require.cache)[0]);

console.log(appPath);
/*
Sharpen or blur the input video.
It accepts the following parameters:
*** luma_msize_x, lx
Set the luma matrix horizontal size. It must be an odd integer between 3 and 63. The default value is 5.
*** luma_msize_y, ly
Set the luma matrix vertical size. It must be an odd integer between 3 and 63. The default value is 5.
*** luma_amount, la
Set the luma effect strength. It must be a floating point number, reasonable values lay between -1.5 and 1.5.
Negative values will blur the input video, while positive values will sharpen it, a value of zero will disable the effect.
Default value is 1.0.
*** chroma_msize_x, cx
Set the chroma matrix horizontal size. It must be an odd integer between 3 and 63. The default value is 5.
*** chroma_msize_y, cy
Set the chroma matrix vertical size. It must be an odd integer between 3 and 63. The default value is 5.
*** chroma_amount, ca
Set the chroma effect strength. It must be a floating point number, reasonable values lay between -1.5 and 1.5.
Negative values will blur the input video, while positive values will sharpen it, a value of zero will disable the effect.
*** Default value is 0.0.
All parameters are optional and default to the equivalent of the string ’5:5:1.0:5:5:0.0’.
*/

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


app.use(bodyParser.json());


app.get('/', function (req, res) {
    var data = fs.readFileSync("index.html");
    res.writeHead("content-type", "text/html");
    res.write(data);
    res.end();
});


app.get('/index.html', function (req, res) {
    var data = fs.readFileSync("index.html");
    res.writeHead("content-type", "text/html");
    res.write(data);
    res.end();
});

app.get('/main.css', function (req, res) {
    var data = fs.readFileSync("main.css");
    res.writeHead("content-type", "text/css");
    res.write(data);
    res.end();
});


app.get('/data', function (req, res) {
    request('http://localhost:8090/stat.html', function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var js = JSON.parse(body);
            js.streamingUrl = 'http://'+req.socket.localAddress+':8090/';

            res.writeHead(200, {"Content-Type": "application/json"});
            res.write(JSON.stringify(js));
            res.end();
        }
    });
});


app.get('/reboot', function (req, res) {
    var proc = req.query.process;


    if ((proc == "") && (req.body.hasOwnProperty("process"))) {
        proc = req.body.enumName;
    }

    if (proc.toUpperCase() == "FFSERVER")
    {
        processes.ffserver.child.kill();
    }

    if (proc.toUpperCase() == "FFM_SOURCE")
    {
        processes.ffmpeg_from_udp.child.kill();
    }

    if (proc.toUpperCase() == "FFM_CDN")
    {
        processes.ffmpeg_to_cdn.child.kill();
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
