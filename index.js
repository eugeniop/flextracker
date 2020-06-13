require('dotenv').config();
const express = require('express');
const session = require('express-session');
const jwt = require('express-jwt');
const jwks = require('jwks-rsa');
const moment = require('moment');

const { log } = console;

//OpenIDC
const { auth, requiresAuth } = require("express-openid-connect");

var server = express();

//Helper functions properties for templates
server.locals.formatDate = function(d){
  return moment(new Date(d)).format('YYYY/MM/DD HH:mm:ss');
};

server.locals.page_size = Number(process.env.PAGE_SIZE) || 100;

//Auth0 OPENIDC config
const config = {
  appSession: false,
  required: false,
  auth0Logout: true,
  baseURL: process.env.BASE_URL,
  issuerBaseURL: process.env.ISSUER,
  authorizationParams: {
    response_type: "code",
    scope: "openid profile",
    //response_mode: "query"
  },
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  handleCallback: function (req, res, next) {
    // Store recevied tokens (access and ID in this case) in server-side storage.
    log(req.openidTokens);
    req.session.user = req.openidTokens.claims();
    req.session.openidTokens = req.openidTokens;
    server.locals.user = req.session.user;
    next();
  },
  getUser: function (req) {
    return req.session.user;
  }
};

//App modules
const api = require('./api');
const sms = require('./sms');
const web = require('./web');

// Only if you're behind a reverse proxy (Heroku, Bluemix, AWS ELB, Nginx, etc)
server.enable("trust proxy"); 

server.set('port', (process.env.PORT || 5000));

server.use(session({
  secret: 'replace this with a long, random, static string',
  resave: false,
  saveUninitialized: false,
  cookie: {}
}));

server.set('views', __dirname + '/web/views');
server.set('view engine', 'ejs');

server.use(auth(config));

server.use('/public', express.static('web/public'));

server.use('/web', requiresAuth(), web);
server.use('/logoff', (req, res, next)=>{
  req.session.destroy();
  res.openid.logout();
})

server.get("/", (req, res) => {
  res.redirect('/web');
});

// API security
const jwtCheck = jwt({
      secret: jwks.expressJwtSecret({
          cache: true,
          rateLimit: true,
          jwksRequestsPerMinute: 5,
          jwksUri: process.env.ISSUER + '/.well-known/jwks.json'
    }),
    audience: 'https://flextracker',
    issuer: process.env.ISSUER,
    algorithms: ['RS256']
});

// All API require a bearer token
server.use('/api', jwtCheck, api);

// SMS handler (uses its own security)
server.use('/sms', sms);

server.listen(server.get('port'), function() {
  console.log('Node app is running on port', server.get('port'));
});