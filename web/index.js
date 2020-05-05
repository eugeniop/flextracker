const express = require('express');
const bodyParser = require('body-parser');
const csrf = require('csurf');
const cookieParser = require('cookie-parser');
const _ = require('lodash');
const moment = require('moment-timezone');

const app = express.Router();
module.exports = app;

const { log } = console;

const domain = require('../domain');

const csrfProtection = csrf({ cookie: true });
const parseForm = bodyParser.urlencoded({ extended: false });

app.use(cookieParser());

const subscriberById = (req, res, next) => {
    domain.getSubscriberById(req.session.user.sub, (e, s)=>{
      if(e) return next(e);
      req.subscriber = s;
      next();
    });
  };

app.get('/', subscriberById, (req, res) => {
  const sub = req.subscriber;
  res.render('home', { userWithNoMetrics: !(sub && sub.metrics && sub.metrics.length > 0) });
});

app.get('/metrics', subscriberById, (req, res, next) =>{
  if(!req.subscriber){
    //Bootstrap subscriber in the database
    domain.createSubscriber(req.session.user.sub, req.session.user.name, (e) =>{
      if(e) { return next(e); }
      return res.render('metrics', {metrics: []});    
    })
  } else {
    //_.filter(s.metrics, (m) => !m.multivalue)
    res.render('metrics', {metrics: _.sortBy(req.subscriber.metrics, 'name') || []});
  }
});

app.get('/metrics/delete/:name', (req, res, next) =>{
  domain.deleteMetric(req.session.user.sub, req.params.name, (e,s) =>{
    if(e) { return next(e) };
    res.redirect('/web/metrics');
  });
});

app.get('/metrics/edit/:name', subscriberById, csrfProtection, (req, res) =>{
  const sub = req.subscriber;
  const metric = _.find(sub.metrics, (m) => m.name === req.params.name);
  const unAvailableCommands = _.map(sub.metrics,(m)=>m.command).join(',');
  res.render('metrics_add_edit', { unAvailableCommands: unAvailableCommands, csrfToken: req.csrfToken(), metric: metric, errors: [] });
});

app.get('/metrics/add', subscriberById, csrfProtection, (req,res) =>{
  const sub = req.subscriber;
  const unAvailableCommands = _.map(sub.metrics,(m)=>m.command).join(',');
  res.render('metrics_add_edit', { unAvailableCommands: unAvailableCommands, csrfToken: req.csrfToken(), metric:{}, errors: [] }); 
});

app.post('/metrics/add', subscriberById, parseForm, csrfProtection, (req, res, next) =>{
  var errors = {};
  var metric = req.body;
  delete metric._csrf;

  if(!metric.name){
    errors.name = 'Please enter a name.';
  }

  if(!metric.command){
    errors.command = "Command is required";
  }

  if(metric.command.indexOf(' ')>-1){
    const nspe = 'Command cannot contain spaces (and it should be short and unique across all metrics)';
    errors.command = errors.command ? errors.command + ". " + nspe : nspe;
  }

  const m = _.find(req.subscriber.metrics, (m) => m.command.toLowerCase() === metric.command.toLowerCase() && 
                                                  m.name !== metric.name);

  if(m){
    const nspe = `Command is already in use by metric <b>${m.name}</b>`;
    errors.command = errors.command ? errors.command + ". " + nspe : nspe;
  }

  if(!metric.units){
    errors.units = 'Please enter units (e.g. "Kg"). If defining a multi-value metric, enter all units separated by ",". (e.g. Kg,Km,m/s)';
  } else {
    metric.units = metric.units.split(',');
  }

  //If min & max are empty, then  no validation is applied
  //To validate a value in a metric, enter both min AND max
  if(metric.min || metric.max){
    //If something is entered on min or max it could be an array or a scalar
    //if scalar -> metric is single valued
    //if array ->  metric is mutlivalued and each value of the array is the
    metric.min = metric.min.split(',');
    metric.max = metric.max.split(',');

    if( (metric.min.length + metric.max.length + metric.units.length ) % 3 !== 0 ){
      errors.max = errors.min = "When using multivalued metrics, UNITS, MIN and MAX must contain the same number of values";
    } else {
      metric.validate = _.map(metric.min, (i) => i && !_.isNaN(Number(i)) ? true : false);
      log(metric.validate);
    }
  } else {    
    //No min or max -> no validation
    delete metric.min;
    delete metric.max;
    delete metric.validate;
  }

  if(_.some(errors)){
    return res.render('metrics_add_edit', {
                                            unAvailableCommands: metric.unAvailableCommands, 
                                            errors: errors, 
                                            metric: metric, 
                                            csrfToken: req.csrfToken()
                                          }); 
  }

  delete metric.unAvailableCommands;

  domain.addMetric(req.session.user.sub, metric, (e, s) =>{
    if(e){ return next(e); }
    res.redirect('/web/metrics/');
  });
});

// Share metric to community
app.get('/metrics/share/:name', subscriberById, csrfProtection, (req,res,next) =>{
  const sub = req.subscriber;
  const metric = _.find(req.subscriber.metrics, (m) => m.name === req.params.name);
  if(!metric){ return next("Invalid metric"); }
  res.render('metric_share', { csrfToken: req.csrfToken(), metric: metric, categories: ['Health', 'Nature', 'Fitness'] }); 
});

app.post('/metrics/share', subscriberById, parseForm, csrfProtection, (req, res, next) =>{
  var { name, category } = req.body;
  const metric = _.find(req.subscriber.metrics, (m) => m.name === name);
  if(!metric){ return next("Invalid metric"); }
  
  domain.shareMetric(req.session.user.sub, category, metric, (e, s) =>{
    if(e){ return next(e); }
    res.redirect('/web/metrics/');
  });
});

// COMMUNITY-----
app.get('/community', subscriberById, (req, res, next) => {
  const category = req.query.category || "health";
  const page = req.query.page || 0;
  domain.getCommunityMetrics(category, page, (e,metrics) => {
    if(e){ return next(e); }
    return res.render('community', { page: page, metrics: metrics });  
  });
});

app.get('/community/delete/:name/:category', subscriberById, (req, res, next) => {
  domain.deleteSharedMetric(req.subscriber.sub, req.params.category, req.params.name, (e) => {
    if(e){ return next(e); }
    return res.redirect('/web/community');
  });
});

app.get('/community/add/:id', subscriberById, (req, res, next) => {
  domain.addCommunityMetric(req.params.id, req.subscriber.sub, (e) => {
    if(e){ return next(e); }
    return res.redirect('/web/metrics');
  });
});

// LOGS ---------
app.get('/metrics/logs/:name?', subscriberById, csrfProtection, (req, res, next) =>{
  if(!req.subscriber.metrics || req.subscriber.metrics.length === 0){
    return res.render('logs', {name: 'No metrics defined yet!', page: 0, logs: [], csrfToken: req.csrfToken()});
  }

  const metricName = req.params.name || req.subscriber.metrics[0].name;
  const page = req.query.page || 0;

  domain.getLogsByPhone(req.subscriber.phone, metricName, page, (e, l) =>{
    if(e){ return next(e); }
    res.render('logs', {name: metricName, page: page, logs: l, csrfToken: req.csrfToken() });
  });
});

app.post('/metrics/logs', parseForm, csrfProtection, (req, res) =>{
  const name = req.body.name;
  res.redirect('/web/metrics/logs/' + name);
});

app.get('/metrics/logs/delete/:name/:id', subscriberById, (req, res, next) =>{
  domain.deleteLogEntry(req.subscriber.phone, req.params.id, (e) =>{
    if(e){ return next(e); }
    res.redirect(`/web/metrics/logs/${req.params.name}`);
  });
});

app.get('/metrics/summary/:name', subscriberById, (req, res, next) =>{
  const metricName = req.params.name;

  const metric = _.find(s.metrics, (m) => m.name === metricName);

  domain.getMetricSummary(req.subscriber.phone, metricName, 30, (e,summary) => {
    if(e){ return next(e); }
    res.render('metric_summary', { metric: metric, stats: summary, name: metricName });
  });
});

// app.get('/metrics/testchart', csrfProtection, (req, res) =>{
  
//   domain.getLogsInLastDaysByPhone("+14252832118", "Blood Pressure", 120, (e, logs) =>{

//     var metric = {
//       units: ["mmHg", "mmHg", "bps"]
//     };

//     var data = [];

//     for(var i=0; i < metric.units.length; i++){
//       data.push(_.map(logs, (l) => {
//                                       return {
//                                         t: moment(l.createdAt)
//                                             .tz('America/Los_Angeles')
//                                             .format('MM/DD/YYYY HH:MM'),
//                                         y: l.value[i]
//                                       };
//                     }));
//     }

//     log(data);

//     res.render('chart', {
//                           user: 'EP',
//                           name: 'Blood Pressure', 
//                           units: metric.units,
//                           data: data, 
//                           csrfToken: req.csrfToken() 
//                         });
//   });
// });


app.get('/metrics/chart/:name?', subscriberById, csrfProtection, (req, res, next) =>{
  
  if(!req.subscriber.metrics || req.subscriber.metrics.length === 0){
    return res.render('metric_chart', {name: 'No metrics defined yet!', logs: [], csrfToken: req.csrfToken()});
  }

  const metricName = req.params.name || s.metrics[0].name;
  
  const metric = _.find(req.subscriber.metrics, (i) => i.name === metricName);

  domain.getLogsInLastDaysByPhone(req.subscriber.phone, metricName, 240, (e, logs) =>{
    if(e){ return next(e); }
    var data = [];

    for(var i=0; i < metric.units.length; i++){
      data.push(_.map(logs, (l) => {
                                      return {
                                        t: moment(l.createdAt)
                                            .tz('America/Los_Angeles')
                                            .format('MM/DD/YYYY HH:MM'),
                                        y: Array.isArray(l.value) ? l.value[i] : l.value // this check is legacy from when we stored scalars. Now all metrics are arrays
                                      };
                    }));
    }

    res.render('metric_chart', {
                          name: metric.name, 
                          units: metric.units,
                          data: data, 
                          csrfToken: req.csrfToken() 
                        });
  });
});

app.post('/metrics/chart', parseForm, csrfProtection, (req, res) =>{
  const name = req.body.name;
  res.redirect('/web/metrics/chart/' + name);
});

app.use((error, req, res, next) => {
  res.render("error", {error: error});
});
