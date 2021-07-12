const axios = require('axios');

const { log } = console;

const options = { 
	                method: 'GET',
	                url: 'https://flextracker.herokuapp.com/ping'
	            };

axios(options)
  .then(res => {
    log('Pinging Flextracker');
    log(res.data);
  })
  .catch(err => {
    console.log(err);
  });