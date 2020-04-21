const express = require('express');
const server = express.Router();
module.exports = server;

const { log } = console;

const domain = require('../domain');

server.get('/subscriber', (req, res, next) => {
    domain.getSubscriberById(req.user.sub, (e, s)=>{
        if(e) return next(e);
        return res.json(s);
    });
});

server.get('/metric', (req, res, next) => {
    domain.getSubscriberById(req.user.sub, (e, s)=>{
        if(e) return next(e);
        return res.json(s.metrics);
    });
});

server.get('/metric/log/:name', (req, res, next) => {
    const page = req.query.page || 0;
    domain.getSubscriberById(req.user.sub, (e_s,s)=>{
        if(e_s) return next(e);
        domain.getLogsByPhone(s.phone, req.params.name, page, (e, logs)=>{
            if(e) return next(e);
            return res.json(logs);
        });
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