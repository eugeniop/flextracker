const _ = require('lodash');
const util = require('util');

const { log } = console;

var sms;

sms = module.exports;

sms.publicMenuOption = (name, help, verbs, handler) => 
{
  return {
    name: name,
    help: help,
    requiresSubscription: false,
    verbs: verbs,
    handler: handler
  };
};

sms.menuOption = (name, help, verbs, handler) => 
{
  const m = sms.publicMenuOption(name, help, verbs, handler);
  m.requiresSubscription = true;
  return m;
};

sms.validateMenu = (menu) => {
  var verbs = _.flatten(_.map(menu,(m) => m.verbs));
  var grouped = _.groupBy(verbs, (n) => n);
  var result = _.uniq(_.flatten(_.filter(grouped, (n) => n.length > 1)));
  return {
    valid: result.length === 0,
    repeatedVerbs: result
  };
};

//Menu functions
sms.findMenuEntry = (menu, verb) => {
  return _.find(menu, (m)=>{
                              return m.verbs.indexOf(verb) > -1;
                            });
};

sms.buildHelp = (menu) => {
  return _.map(_.sortBy(menu, 
                        (m) => m.verbs[0]), 
                        (m) => {
                            return m.verbs[0] + " : " + m.name;
                        })
            .join('\n');
};
  
sms.buildHelpForMenuEntry = (menuEntry) => {
  return util.format( "%s:\n%s\nAliases:\n%s", menuEntry.name, 
                                              menuEntry.help, 
                                              menuEntry.verbs.join(","));
};

sms.addHelpHandler = (menu, getSubscriberAndCommand) =>{
  menu.push({
              name: "Help",
              help: "Help! h {command}",
              verbs: ["h", "help"],
              handler: (done) => { //help
                const { subscriber, command } = getSubscriberAndCommand();

                var menuEntry = sms.findMenuEntry(menu, command);
                if(menuEntry && menuEntry.help){
                  done(null, sms.buildHelpForMenuEntry(menuEntry));
                } else {
                  //Sends generic help
                  done(null, sms.buildHelp(menu));
                }
              },
          });
}

sms.getPhone = (req) => {
  if(req.method === 'POST'){
    return req.body.From;
  }
  return req.query.From;
}

sms.parseInput = (req) => {
  var output = {};
  var input = "";

  if(req.method === 'POST'){
    input = req.body.Body ? req.body.Body.trim() : null;
  } else {
    input = req.query.Body ? req.query.Body.trim() : null;
  }

  if(!input) return output;

  //Check if the app was initiated from the sms Router
  const ref = req.header('Referer');

  //If request comes from router, eliminate first word (the command for the router)
  if(ref && ref.indexOf('smsrouter') > -1){
    input = input.substring(input.indexOf(' ') + 1).trim();
  }

  var separator = input.indexOf(' ');

  if(separator > 0){
    output.verb = input.substring(0, separator).toLowerCase();
    output.command = input.substring(separator + 1).trim();
  } else {
    output.verb = input.substring(0).toLowerCase();
    output.command = null;
  }
  return output;
};

//Evaluates whether a command can be executed. Checks for subscriber / admin requirements
sms.canExecuteCommand = (verb, menuEntry, subscriber) => {
  var canExecute = {
    result: false,
    whyNot: util.format("Command not recognized [%s]\n%s", verb, "For help, send 'h' command.")
  };

  if(!menuEntry){
    return canExecute;
  }

  if(menuEntry.requiresSubscription && !subscriber){
      canExecute.whyNot = "This command requires a subscriber. Please subscribe.";
      return canExecute;
  }

  canExecute.result = true;
  return canExecute;
}

/*------------Helper functions ---------------*/
sms.sendSMSResponse = (res, msg, mediaUrl) => {
  var MessagingResponse = require('twilio').twiml.MessagingResponse;
  var response = new MessagingResponse();
  
  const message = response.message();
  message.body(msg);
  if(mediaUrl){
    message.mediaUrl = mediaUrl;
  }
  res.writeHead(200, {'Content-Type': 'text/xml'});
  res.end(response.toString());
};

sms.sendSMSToRecipient= (from, to, msg, done) => {
  var tw = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  tw.messages
          .create({
                    to: to,
                    from: from,
                    body: msg
                  }, done);
};
