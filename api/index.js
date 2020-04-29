const express = require('express');
const bodyParser = require('body-parser');
const server = express.Router();
module.exports = server;

const { log } = console;

const domain = require('../domain');

const subscriberById = (req, res, next) => {
    domain.getSubscriberById(req.user.sub, (e, s)=>{
      if(e) return next(e);
      req.subscriber = s;
      next();
    });
  };

const json = bodyParser.json();

server.use(subscriberById);

//Returns the subscriber (identified by the JWT, see subscriberById middleware)
server.get('/subscriber', (req, res, next) => {
    return res.json(req.subscriber);
});

//Returns all metrics of a user
server.get('/metric', subscriberById, (req, res, next) => {
    return res.json(req.subscriber.metrics);
});

//Adds a metric for a user
server.post('/metric', subscriberById, json, (req, res, next) => {

});

//Updates a metric for a user
server.put('/metric/:name', subscriberById, (req, res, next) => {

});

//Deletes metric for the user, ignores if cannot be found
server.delete('/metric/:name', subscriberById, (req, res, next) => {

});

server.get('/metric/log/:name', (req, res, next) => {
    const page = req.query.page || 0;
    domain.getLogsByPhone(req.subscriber.phone, req.params.name, page, (e, logs)=>{
        if(e) return next(e);
        return res.json(logs);
    });
});

server.get('/metric/summary/:name', (req, res, next) => {
    domain.getMetricSummary(req.user.sub, (e_s,s)=>{
        if(e_s) return next(e);
        domain.getLogsByPhone(s.phone, req.params.name, page, (e, logs)=>{
            if(e) return next(e);
            return res.json(logs);
        });
    });
});