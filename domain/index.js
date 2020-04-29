var domain = module.exports;

const async = require('async');
const _ = require('lodash');
const { ObjectID } = require('mongodb');

const { log } = console;

const subscribers_collection = 'subscribers';
const log_collection_prefix = 'events_';

const db = require('./db.js');

var page_size = Number(process.env.PAGE_SIZE);

if(_.isNaN(page_size)){
  page_size = 100;
}

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
                    tz: 'America/Los_Angeles'   //Fixed TZ for now. TODO: consider customizing TZ by subscriber
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
  if(!metric.name){ return done("Name is missing or contains spaces"); }
  if(!metric.units){ return done("Units are required"); }
  
  if(!metric.validate){
    delete metric.min;
    delete metric.max;
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

  {value} is asumed numeric and checked against {min} and {max} in the metric definition.

  If the metric is multi-valued, the expected format is:

  {metric command} {value-0} {value-1} ... {value-n} {extra content}

*/
domain.saveSample = (subscriber, command, done) => {

  if(!command){ return done("ERROR. No arguments"); }

  const args = command.split(' ');
  const metric = _.find(subscriber.metrics, (m) => m.command.toLowerCase() === args[0].toLowerCase());

  if(!metric){ return done(`ERROR. No metric associated with command: ${args[0]}`); }

  var msg = ""

  if(!metric.multivalue){

    //Save a single value sample
    const value = Number(args[1]);

    if(_.isNaN(value)){ return done("ERROR. The value is not numeric or is empty"); }

    if(metric.validate && (value < metric.min || value > metric.max)){
      return done(`ERROR. ${value} is an invalid value. Valid ranges:\nMin: ${metric.min}\nMax: ${metric.max}`);
    } else {

      var event = {
        event: metric.name,
        value: value,
        notes: _.join(_.slice(args,2), " "),
        createdAt: new Date(),
      };
    }

    msg = `${value} ${metric.units}`;

  } else {

    //Multivalue metric. Each value can have its own range validation
    /*
      metric.multivalue returns the number of expected values
      validate and min/max are array
      
      For example:
      metric with 3 values. value[0] and value[2] are validated in a range, but not value[1]
      validate = [true, false, true]
      min = [0, 0, -10]
      max = [10, 0, 10]

      value[0] can only between 0 and 10
      value[1] can be any value
      value[2] can only be between -10 and 10

    */
    if(args.length < metric.multivalue + 1){
      return done(null, `Metric ${metric.name} expects at least ${metric.multivalue} values`);
    }

    var values = [];

    for(var i=0; i<metric.multivalue; i++){
      if(metric.validate[i]){
        const value = Number(args[i+1]);
        if(_.isNaN(value)){ return done(`ERROR. ${value} is not a valid numeric value`); }
        if(value < metric.min[i] || value > metric.max[i]){
          return done(`ERROR. ${value} is outside the valid range (${metric.min[i]} - ${metric.max[i]})`);
        }
        values.push(value);
      }else{
        values.push(args[i+1]);
      }
    }
    //All good, save
    var event = {
      event: metric.name,
      value: values,
      notes: _.join(_.slice(args, metric.multivalue), " "), //Anything after the values we save as notes
      createdAt: new Date(),
    };

    msg = _.zipWith(event.value, metric.units, (v,u)=> v + " " + u);
  }

  db.connectDb((err, client) => {
  if(err){ return done("Cannot connect to Database", err); }
  client.db()
    .collection(getSamplesCollectionName(subscriber.phone))
      .insertMany([event], (err, r) => {
        client.close();
        if(err){
          return done('Recording event(s) failed. Please try again');
        }

        return done(null, `New ${event.event} value(s) saved: ${msg}`);
      });
  });
};

domain.getLogsByPhone = (phone, metricName, page, done) =>{
  domain.getData(phone, {
                          event: metricName
                        }, page, page_size, -1,
    (err, data) => {
      if(err) return done(err);
      done(null, data);
    });
};

domain.deleteLogEntry = (phone, id, done) =>{
  db.connectDb((err, client) => {
    if(err){ return done("Cannot connect to Database", err); }
    client.db()
      .collection(getSamplesCollectionName(phone))
      .delete({ _id: new ObjectID(id) }, (e) =>{
        if(e){ return done("Error deleting log entry: " + err); }
        done(null);
      });
  });
};

function getSamplesCollectionName(phone){
  return log_collection_prefix + phone.replace("+", "");
}

//Used for charts
domain.getLogsInLastDaysByPhone = (phone, metricName, days, done) =>{
  domain.getData(phone, {
                          event: metricName,
                          createdAt: {
                            $gte: new Date(new Date().getTime() - days * 24 * 60 * 60 * 1000),
                          },

                        }, 0, 100, 1,
    (err, data) => {
      if(err) return done(err);
      done(null, data);
    });
};



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
domain.getMetricSummary = (phone, metricName, days, done) => {
  domain.getData(phone, {
                          event: metricName,
                          createdAt: {
                            $gte: new Date(new Date().getTime() - days * 24 * 60 * 60 * 1000),
                          },
                        },
                  0, 200, 1,
    (err, data) => {
      if(err) return done(err);

      if(data.length === 0) {
        return done(null, { samples: 0 });
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

domain.getData = (phone, query, page, pageSize, dateSort, done) => {
  db.connectDb((err, client) => {
    var db = client.db();
    if(err){
      return done(err);
    }

    db.collection(getSamplesCollectionName(phone))
      .find(query)
      .sort({createdAt: dateSort  })
      .skip(pageSize * page)
      .limit(pageSize)
      .toArray((err, results) => {
        client.close();
        if(err){
          return done(err);
        }
        done(null, results);
      });
  });
};
