const express = require('express');
const server = express.Router();
module.exports = server;

const _ = require('lodash');
const twilio = require('twilio');
const async = require('async');

const { log } = console;

const sms = require('./smsutils');
const domain = require('../domain');

server.post('/', smsHandler);
server.get('/', smsHandler);

function smsHandler(req, res, next){

  const twilioSignature = req.headers['x-twilio-signature'];
  const params = req.body;

  const requestIsValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    twilioSignature,
    process.env.BASE_URL,
    params
  );

  if (!requestIsValid) {
    log("INVALID TW REQ");
  }

  //Commands on SMS are of the format: {c} {args}
  var { verb, command } = sms.parseInput(req);
  var phone = sms.getPhone(req);
  var locals = {};

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
                        done(null, `Hello ${phone}.\nYour time zone is: ${locals.subscriber.tz}\nYou've got ${locals.subscriber.metrics.length} metrics.`);
                      }),
        sms.menuOption('List Metrics',
                      '"lm"',
                      ['lm', 'list'],
                      (done) => {
                        //Returns all metrics defined for this subscriber
                        
                      }),
        sms.menuOption('Save new sample',
                      '"s {metric shortcut} {value} {extra}"',
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