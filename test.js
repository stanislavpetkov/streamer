/**
 * Created by sunny on 15-11-8.
 */


var express = require('express');
var bodyParser = require('body-parser'); // for reading POSTed form data into `req.body`
var expressSession = require('express-session');
var cookieParser = require('cookie-parser'); // the session is stored in a cookie, so we use this to parse it

var app = express();

// must use cookieParser before expressSession
app.use(cookieParser());

app.use(expressSession({secret:'somesecrettokenhere',resave: true, saveUninitialized: true, proxy: true}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', function(req, res){
    var html = '<form action="/" method="post">' +
        'Your name: <input type="text" name="userName"><br>' +
        '<button type="submit">Submit</button>' +
        '</form>';
    if (req.session.userName) {
        html += '<br>Your username from your session is: ' + req.session.userName;
    }
    res.send(html);
});

app.post('/', function(req, res){
    req.session.userName = req.body.userName;
    res.redirect('/');
});

app.listen(9999);