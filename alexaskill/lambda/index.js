require('dotenv').config();
const Redis = require('ioredis');

const Alexa = require('ask-sdk-core');
const doa = require('wikipediadeadoralive');

const EXPIRY_TIME = 60 * 60 * 24;

const CELEBRITIES_KEY = 'celebrities';
const CURRENT_CELEB_KEY = 'currentCeleb';
const SCORE_KEY = 'score';
const KEY_PREFIX = 'doa';
const KEY_SEPARATOR = ':';
const NUM_ROUNDS = 10;
const HELP_TEXT = `Hi there - I'm a celebrity dead or alive game... ask me to start a new game and I'll ask you whether ${NUM_ROUNDS} celebrities are dead or alive, and keep track of how many you get right. Sound like fun? Let's go!`;

const redisConf = {
  port: process.env.REDIS_PORT || 6379,
  host: process.env.REDIS_HOST || 'localhost'
};


if (process.env.REDIS_PASSWORD) {
  redisConf.password = process.env.REDIS_PASSWORD;
}

const getSessionId = handlerInput => handlerInput.requestEnvelope.session.sessionId;

const getKeyName = (...args) => `${KEY_PREFIX}${KEY_SEPARATOR}${args.join(KEY_SEPARATOR)}`;

const getRandomCeleb = async (redis, sessionId) => {
  const celebName = await redis.spop(getKeyName(sessionId, CELEBRITIES_KEY));
  return celebName;
}

const getCeleb = async (redis, celebName) => {
  const celeb = await redis.hgetall(getKeyName(celebName));
  
  return celeb;
};

const getCelebStatus = async (redis, celeb) => {
  // Check for cached result.
  const celebStatusKey = getKeyName(celeb, 'status');
  let status = await redis.hgetall(celebStatusKey);

  if (Object.keys(status).length === 0) {
    // Wasn't cached, fetch it and cache it.
    status = await doa.getStatus(celeb);
    await redis.hmset(celebStatusKey, status);
    redis.expire(celebStatusKey, EXPIRY_TIME);
  }
  
  if (typeof(status.dead) === 'string') {
      status.dead = status.dead === 'true';
  }

  return status;
};

const validateAnswer = async (redis, celebName, isDead) => {
  if (! celebName) {
    return null;
  }

  // Get the celeb's status...
  const celebStatus = await getCelebStatus(redis, celebName);

  if (! celebStatus) {
    return null;
  }

  // Does the user's answer match the celeb's status?
  console.log(`isDead.toString() ${isDead.toString()}, celebStatus.dead = ${celebStatus.dead}`);
  celebStatus.correct = isDead === celebStatus.dead;

  return celebStatus;
};


const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak(HELP_TEXT)
            .reprompt(HELP_TEXT)
            .getResponse();
    }
};

const StartGameIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'StartGameIntent';
    },
    async handle(handlerInput) {
        // Do this globally and avoid having to call the quit functions like this:
        // context.callbackWaitsForEmptyEventLoop to false to force callback to return result without waiting for event loop to finish
        const redis = new Redis(redisConf);
        
        const sessionId = getSessionId(handlerInput);
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

        // TODO this should move to Lua...
        const celebritySetKeyName = getKeyName(CELEBRITIES_KEY);

        const userSetKeyName = getKeyName(sessionId, CELEBRITIES_KEY);
        await redis.del(userSetKeyName);
    
        let numUserCelebs = 0;
    
        do {
            let randomCeleb = await redis.srandmember(celebritySetKeyName);
            await redis.sadd(userSetKeyName, randomCeleb);
            numUserCelebs = await redis.scard(userSetKeyName);
        } while (numUserCelebs < NUM_ROUNDS);
    
        // Expire the user's celebrity set later, as an automatic cleanup
        // if they abandon the game.
        redis.expire(userSetKeyName, EXPIRY_TIME);
    
        // Initialize the user's score.
        sessionAttributes[SCORE_KEY] = 0;

        // Get a random celeb...
        const celebName = await getRandomCeleb(redis, sessionId);
        const celeb = await getCeleb(redis, celebName);
        sessionAttributes[CURRENT_CELEB_KEY] = celebName;

        const speakOutput = `Let's go, here's the first of your ${NUM_ROUNDS} celebrities... is ${celeb.name}, ${celeb.bio}, dead or alive?`;
        
        redis.quit();
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const handleDeadOrAliveAnswer = async (handlerInput, userSaidDead) => {
    const redis = new Redis(redisConf);
    const sessionId = getSessionId(handlerInput);
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const celebToCheck = sessionAttributes[CURRENT_CELEB_KEY];

    let speakOutput;

    if (! celebToCheck) {
        // This session doesn't currently have a game in progress...
        speakOutput = 'You\'re not currently playing... ask me to start a new game if you\'d like to begin.';
    } else {
        // Check what the status of this celebrity is...
        const result = await validateAnswer(redis, celebToCheck, userSaidDead);
        console.log(result);
        
        if (result) {
            if (result.correct) {
                speakOutput = 'Correct!';
                
                if (userSaidDead) {
                    speakOutput = `${speakOutput} ${result.name} died in ${result.died}.`;
                }
                
                speakOutput = `${speakOutput} ${result.description}`;
                sessionAttributes[SCORE_KEY] = sessionAttributes[SCORE_KEY] + 1;
            } else {
                speakOutput = `Wrong! ${result.description}`;
            }
            
            // Get the next celeb... if there is one...
            const celebName = await getRandomCeleb(redis, sessionId);
            
            if (celebName) {
                const celeb = await getCeleb(redis, celebName);
                sessionAttributes[CURRENT_CELEB_KEY] = celebName;
                speakOutput = `${speakOutput} OK, next it's ${celeb.name}, ${celeb.bio} Dead or alive?`;
            } else {
                // They have been asked about all the celebs, game over!
                speakOutput = `${speakOutput} And that's it for this game, you scored ${sessionAttributes[SCORE_KEY]} out of ${NUM_ROUNDS}! To play again, tell me to start a new game.`;
                
                // Clean up the session.
                delete sessionAttributes[CURRENT_CELEB_KEY];
                delete sessionAttributes[SCORE_KEY];
            }
        } else {
            speakOutput = 'Sorry, something went wrong.';
        }
    }
    
    redis.quit();
    
    return speakOutput;
};

const AnswerDeadIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AnswerDeadIntent';
    },
    async handle(handlerInput) {
        const speakOutput = await handleDeadOrAliveAnswer(handlerInput, true);
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const AnswerAliveIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AnswerAliveIntent';
    },
    async handle(handlerInput) {
        const speakOutput = await handleDeadOrAliveAnswer(handlerInput, false);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak(HELP_TEXT)
            .reprompt(HELP_TEXT)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Cancel and stop!';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Sorry, I don\'t know about that. Please try again.';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    async handle(handlerInput) {
        const redis = new Redis(redisConf);
        const sessionId = getSessionId(handlerInput);
        
        console.log(`Cleanup for session ${sessionId}`);
        
        const userSetKeyName = getKeyName(sessionId, CELEBRITIES_KEY);
        await redis.del(userSetKeyName);
        
        redis.quit();
        
        return handlerInput.responseBuilder.getResponse();
    }
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput = 'Sorry, I had trouble doing what you asked. Please try again.';
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        StartGameIntentHandler,
        AnswerDeadIntentHandler,
        AnswerAliveIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler)
    .addErrorHandlers(
        ErrorHandler)
    .withCustomUserAgent('deadoralive')
    .lambda();