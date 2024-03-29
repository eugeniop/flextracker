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
const twilioValidator =  twilio.webhook({protocol: 'https', validate: process.env.VALIDATE_TWILIO_REQUESTS === "1" ? true : false}); //protocol is needed because we are fronting the app with Cloudflare

server.post('/', [parseForm, parseJson, twilioValidator], smsHandler);

if(process.env.NODE_ENV !== 'production'){
  server.get('/', parseForm, smsHandler);
}

function smsHandler(req, res, next){

  //Commands on SMS are of the format: {c} {args}
  var { verb, command } = sms.parseInput(req);
  var phone = sms.getPhone(req);
  var locals = {};

  async.series(
    [(cb) => {
      domain.getSubscriberByPhone(phone, (e, subscriber) => {
        if(e) return cb(e);
        locals.subscriber = subscriber;
        console.log(subscriber);
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
        sms.menuOption('Summary of a metric ',
                      '"sum {metric command} {days} [index]". e.g. sum bp 20 0',
                      ['sum'],
                      (done) => {

                        if(!command){
                          return done(null,"Metric command is required");
                        }

                        const params = command.split(' ');

                        const metric = _.find(locals.subscriber.metrics, 
                                              (m) => {
                                                return m.command.toLowerCase() === params[0].toLowerCase();
                                              });

                        if(!metric){
                          return done(null, "Metric not defined in your profile");
                        }

                        const days = params[1] ? Number(params[1]) : 30;
                        const index = params[2] ? Number(params[2]) : 0;
                        
                        domain.getMetricSummary(phone, metric.name, index, days, (e,s) =>{
                          /*
                            Returns a stats object with:
                            {
                              samples: 2,
                              min:
                              max:
                              avg:
                              median:
                            }
                          */
                          if(e){ 
                            return done(null, `Could not retrieve summary for ${metricName}`); 
                          }
                          if(s.samples === 0){ 
                            return done(null, "No samples for this metric!"); 
                          }
                          done(null, `${s.samples} samples in ${days} days on index ${index}\nMax: ${s.max}\nMin: ${s.min}\nAvg: ${s.avg}\nMedian: ${s.median}`);
                        });    
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