var db = module.exports;

const { MongoClient } = require('mongodb');

db.connectDb = (done) =>{
  MongoClient.connect(process.env.MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
    if (err) return done(err, "System error. Please try sometime else");
    done(null, client);
   });
};