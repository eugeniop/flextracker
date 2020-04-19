const express = require('express');
const bodyParser = require('body-parser');
const csrf = require('csurf');
const cookieParser = require('cookie-parser');
const _ = require('lodash');
const app = express.Router();
module.exports = app;

const { log } = console;

const domain = require('../domain');

const csrfProtection = csrf({ cookie: true });
const parseForm = bodyParser.urlencoded({ extended: false });

app.use(cookieParser());

app.get('/', (req, res) => {
  domain.getSubscriberById(req.session.user.sub, (e, s)=>{    
    res.render('home', { userWithNoMetrics: !(s.metrics && s.metrics.length > 0) });
  });
});

app.get('/metrics', (req, res) =>{
  domain.getSubscriberById(req.session.user.sub, (e, s)=>{
    if(!s){
      //Bootstrap subscriber in the database
      domain.createSubscriber(req.session.user.sub, req.session.user.name, (e) =>{
        return res.render('metrics', {metrics: []});    
      })
    } else {
      res.render('metrics', {metrics: s.metrics || []});
    }
  });
});

app.get('/metrics/delete/:name', (req, res) =>{
  domain.deleteMetric(req.session.user.sub, req.params.name, (e,s) =>{
    res.render('metrics', {metrics: s.metrics || []}); 
  });
});

app.get('/metrics/edit/:name', csrfProtection, (req, res) =>{
  domain.getSubscriberById(req.session.user.sub, (e, s)=>{
    const metric = _.find(s.metrics, (m) => m.name === req.params.name);
    res.render('metrics_add_edit', { csrfToken: req.csrfToken(), metric: metric, errors: [] });
  });
});

app.get('/metrics/add', csrfProtection, (req,res) =>{
  res.render('metrics_add_edit', { csrfToken: req.csrfToken(), metric:{}, errors: [] }); 
});

app.post('/metrics/add', parseForm, csrfProtection, (req, res) =>{
  var errors = {};
  var metric = req.body;
  delete metric._csrf;

  log(metric);

  if(!metric.name){
    errors.name = 'Please enter a name.';
  }

  if(metric.name.indexOf(' ')>-1){
    const nspe = 'Name cannot contain spaces';
    errors.name = errors.name ? errors.name + ". " + nspe : nspe;
  }

  if(!metric.command){
    errors.command = "Command is required";
  }

  if(metric.command.indexOf(' ')>-1){
    const nspe = 'Command cannot contain spaces (and it should be short and unique  )';
    errors.command = errors.command ? errors.command + ". " + nspe : nspe;
  }

  if(!metric.units){
    errors.units = 'Please enter units (e.g. "Kg")';
  }

  if(metric.validate && metric.validate === 'on'){
    if(_.isNaN(Number(metric.min)) || _.isNaN(Number(metric.max))){
      errors.validate = 'If validation is enabled, "MIN" and "MAX" must be valid numbers';
    }
  }

  if(_.some(errors)){
    return res.render('metrics_add', {errors: errors, metric: metric, csrfToken: req.csrfToken()}); 
  }

  domain.addMetric(req.session.user.sub, metric, (e, s) =>{
    res.render('metrics', {metrics: s.metrics}); 
  });
});

app.get('/metrics/logs/:name?', csrfProtection, (req, res) =>{
  domain.getSubscriberById(req.session.user.sub, (e, s)=>{
    if(!s.metrics || s.metrics.length === 0){
      return res.render('logs', {name: 'No metrics defined yet!', logs: [], csrfToken: req.csrfToken()});
    }

    const metricName = req.params.name || s.metrics[0].name;

    domain.getLogsByPhone(s.phone, metricName, req.query.page || 0, (e, l) =>{
      res.render('logs', {name: metricName, logs: l, csrfToken: req.csrfToken() });
    });
  });
});

app.post('/metrics/logs', parseForm, csrfProtection, (req, res) =>{
  log(req.body);
  const name = req.body.name;
  res.redirect('/web/metrics/logs/' + name);
});