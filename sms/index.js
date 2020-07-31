const express = require('express');
const server = express.Router();
module.exports = server;

const _ = require('lodash');
const twilio = require('twilio');
const async = require('async');
const bodyParser = require('body-parser');

const { log } = console;

const sms = require('./smsutils');
const domain = require('../domain');


const parseForm = bodyParser.urlencoded({ extended: false });
const parseJson = bodyParser.json();
const twilioValidator =  twilio.webhook();

server.post('/', [parseForm, parseJson], smsHandler);

if(process.env.NODE_ENV !== 'production'){
  server.get('/', parseForm, smsHandler);
}

function validate(req){
  const twilioSignature = req.headers['x-twilio-signature'];
  const params = req.body;
  const url = 'https://flextracker.io/sms';

  console.log(twilioSignature);
  console.log(request.protocol);
  console.log(request.headers.host);

  const requestIsValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    twilioSignature,
    url,
    params
  );

  console.log("Validation:", requestIsValid);
}


function smsHandler(req, res, next){

  //Commands on SMS are of the format: {c} {args}
  var { verb, command } = sms.parseInput(req);
  var phone = sms.getPhone(req);
  var locals = {};

  console.log(req.body);
  validate(req);

  async.series(
    [(cb) => {
      domain.getSubscriberByPhone(phone, (e, subscriber) => {
        if(e) return cb(e);
        locals.subscriber = subscriber;
        cb();  
      });
    },
    (cb) => {
      var menu = [
        sms.menuOption('Subscriber',
                      '"me" returns information about self.',
                      ['m', 'self', 'me'],
                      (done) => {
                        var m = 0;
                        if(locals.subscriber.metrics){
                          m = locals.subscriber.metrics.length;
                        }
                        done(null, `Hello ${phone}.\nYour time zone is: ${locals.subscriber.tz}\nYou've got ${m} metrics.`);
                      }),
        sms.menuOption('List Metrics',
                      '"lm"',
                      ['lm', 'list'],
                      (done) => {
                        const m = locals.subscriber.metrics  || [];
                        if(m.length === 0){
                          return done(null, "You've got no metrics defined");
                        }
                        var msg = `You've got ${m.length} metrics\n`;
                        msg += _.map(m, (i) => `${i.name} - use command: ${i.command}.`).join("\n");
                        return done(null, msg);
                      }),
        sms.menuOption('Save new sample',
                      '"s {metric command} {value} {extra}"',
                      ['s', 'save'],
                      (done) => {
                        domain.saveSample(locals.subscriber, command, done);
                      }),
      ];
      
      sms.addHelpHandler(menu, () => {
        return {
          subscriber: locals.subscriber, 
          command: command
        };
      });

      const validation = sms.validateMenu(menu);
      if(validation.valid === false){
        log('WARNING. Menu is invalid');
        log(validation.repeatedVerbs);
      }

      var menuEntry = sms.findMenuEntry(menu, verb);
      var canExecute = sms.canExecuteCommand(verb, menuEntry, locals.subscriber);

      if(canExecute.result){
          menuEntry.handler((e, msg) => {
                              locals.smsResponse = e || msg;
                              cb();
                            });
      } else {
        locals.smsResponse = canExecute.whyNot; 
        cb();
      }
    }],
    (error)=>{
      log(error);
      sms.sendSMSResponse(res, error ? `ERROR. Please try again. (${error})` : locals.smsResponse);
    });
}