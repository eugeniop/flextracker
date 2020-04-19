var domain = module.exports;

// const { ObjectID } = require('mongodb');

const async = require('async');
const _ = require('lodash');
// const moment = require('moment-timezone');

const { log } = console;

const subscribers_collection = 'subscribers';
const log_collection_prefix = 'events_';

const db = require('./db.js');

const page_size = process.env.PAGE_SIZE || 100;

domain.getSubscriberById = (sub, done) => {
  db.connectDb((err, client) => {
    if(err){ return done(err); }
    client
      .db()
      .collection(subscribers_collection)
        .findOne({sub: sub}, (e, subscriber) => {
                                    client.close();
                                    if(err){ return done(e); }
                                    return done(null, subscriber);
          });
  });
};

domain.getSubscriberByPhone = (phone, done) => {
  db.connectDb((err, client) => {
    if(err){ return done(err); }
    client
      .db()
      .collection(subscribers_collection)
        .findOne({phone: phone}, (e, subscriber) => {
                                    client.close();
                                    if(err){ return done(e); }
                                    return done(null, subscriber);
          });
  });
};

domain.getSubscriberById = (sub, done) => {
  db.connectDb((err, client) => {
    if(err){ return done(err); }
    client
      .db()
      .collection(subscribers_collection)
        .findOne({sub: sub}, (e, subscriber) => {
                                    client.close();
                                    if(err){ return done(e); }
                                    return done(null, subscriber);
          });
  });
};

//Creates the record for a new user
domain.createSubscriber = (sub, phone, done) => {
  db.connectDb((e,client)=>{
    if(e) return done(e);
    client.db()
          .collection(subscribers_collection)
          .update({sub: sub}, 
                  { $set: {
                    sub: sub,
                    phone: phone,
                    tz: 'America/Los_Angeles' 
                  } }, 
                  {upsert: true}, 
                  (error, count) => {
                    if(error) return done(error);
                    done();  
                  });
  });
};


domain.deleteMetric = (sub, metricName, done) =>{
  db.connectDb((e,client)=>{
    if(e) return done(e);
    const db = client.db();
    db.collection(subscribers_collection)
        .findOne({sub: sub}, (e, subscriber) => {
          if(e) return done(e);
          _.remove(subscriber.metrics, (m)=> m.name === metricName);

          db.collection(subscribers_collection)
              .update({sub: sub}, {$set: subscriber}, (e) =>{
                client.close();
                if(e) return done(e);
                done(null,subscriber);
              })
        });
  });
};

domain.addMetric = (sub, metric, done) =>{

  //Validate metric
  if(!metric){ return done("No metric definition"); }
  if(!metric.name || metric.name.indexOf(' ')>-1){ return done("Name is missing or contains spaces"); }
  if(!metric.units){ return done("Units are required"); }
  
  if(metric.validate === false){
    delete metric.min;
    delete metric.max;
  } else {
    if(_.isNaN(metric.min) || _.isNaN(metric.max) ){
      return done('With validation enbaled, MAX and MIN miust be valid numbers');
    }
  }

  var locals = {};

  async.series([
    (cb) => {
      db.connectDb((e,client)=>{
        if(e) return cb(e);
        locals.client = client;
        cb();
      });      
    },
    (cb) => {
      locals.client
        .db()
        .collection(subscribers_collection)
          .findOne({sub: sub}, (e, subscriber) => {
            if(e) return cb(e);
            locals.subscriber = subscriber;
            cb();
          });
    },
    (cb) => {
      if(!locals.subscriber.metrics){
        locals.subscriber.metrics = [];
      } else {
        //remove whatever was there before
        _.remove(locals.subscriber.metrics, (m) => m.name === metric.name);
      }
      locals.subscriber.metrics.push(metric);
      cb();
    },
    (cb) => {
      locals.client
        .db()
        .collection(subscribers_collection)
          .update({sub: sub}, 
                  { $set: locals.subscriber }, 
                  {upsert: true}, (error, count) => {
                    if(error) return cb(error);
                    cb();
                  });
    }
    ], (e)=>{
      locals.client.close();
      if(e) return done(e);
      done(null, locals.subscriber);
    });
};

/*
  Saves a new sample of a metric:
  command is a string with the format:
  
  {metric command} {value} {extra content}
  
  {metric command} is defined and should exist in subscriber.metrics

  {value} is asumed numeric and checked against {min} and {max} in the metric definition

*/
domain.saveSample = (subscriber, command, done) => {

  if(!command){ return done("ERROR. No arguments"); }

  const args = command.split(' ');

  const metric = _.find(subscriber.metrics, (m) => m.command === args[0].toLowerCase());

  if(!metric){ return done("ERROR. Undefined metric"); }

  const value = Number(args[1]);

  if(_.isNaN(value)){ return done("ERROR. The value is not numeric or is empty"); }

  if(value >= metric.min && value < metric.max){

    var event = {
      event: metric.name,
      value: value,
      notes: _.join(_.slice(args,2), " "),
      createdAt: new Date(),
    };

    db.connectDb((err, client) => {
    if(err) return done("Cannot connect to Database", err);
    client.db()
      .collection(getSamplesCollectionName(subscriber.phone))
        .insertMany([event], (err, r) => {
          client.close();
          if(err){
            return done('Recording event(s) failed. Please try again');
          }
          done(null, `New ${event.event} value saved.`);
        });
    });

  } else {
    done(`ERROR. ${value} is an invalid value. Valid ranges:\nMin: ${metric.min}\nMax: ${metric.max}`);
  }
};

domain.getLogsByPhone = (phone, metricName, page, done) =>{
  domain.getData(phone, {
                          event: metricName
                        }, page, 
    (err, data) => {
      if(err) return done(err);
      done(null, data);
    });
};

function getSamplesCollectionName(phone){
  return log_collection_prefix + phone.replace("+", "");
}

// /* 
//   Returns a simple statistic object with teh following schema:
//   {
//       min: 98,
//       max: 101,
//       avg: 95,
//       median: 98,
//       samples: 26
//   }
// */

domain.getMetricSummary = (sub, metricName, days, done) => {
  domain.getData(phone, {
                          event: metricName,
                          createdAt: {
                            $gte: new Date(new Date().getTime() - days * 24 * 60 * 60 * 1000),
                          },
                        },
                  0,
    (err, data) => {
      if(err) return done(err);

      if(data.length === 0) {
        return done(null, null);
      }

      var ss = require('simple-statistics');
      var value_data = _.map(data, (s) => s.value);
      
      var stats = {
        samples: value_data.length
      };

      if(stats.samples > 0){
        stats.min = ss.min(value_data),
        stats.max = ss.max(value_data),
        stats.avg = Math.round(ss.mean(value_data)*100)/100,
        stats.median = ss.median(value_data)
      }
      done(null, stats);
    });
}

domain.getData = (phone, query, page, done) => {
  db.connectDb((err, client) => {
    var db = client.db();
    if(err){
      return done(err);
    }

    db.collection(getSamplesCollectionName(phone))
      .find(query, { sort: ['createdAt'] })
      .skip(page_size * page)
      .limit(page_size)
      .toArray((err, results) => {
        client.close();
        if(err){
          return done(err);
        }
        done(null, results);
      });
  });
}


domain.getDays = (days) => {
  var topDaySpan = 1000;
  if (!days || days > topDaySpan) {
    return topDaySpan;
  }
  return days;
}
