const doa = require('wikipediadeadoralive');
const { getRedisClient, getKeyName } = require('./redis');

const redis = getRedisClient();
const EXPIRY_TIME = 60 * 60 * 24;

const CELEBRITIES_KEY = 'celebrities';
const CURRENT_KEY = 'current';
const SCORE_KEY = 'score';

const getCelebStatus = async (celeb) => {
  // Check for cached result.
  const celebStatusKey = getKeyName(celeb, 'status');
  let status = await redis.hgetall(celebStatusKey);

  if (Object.keys(status).length === 0) {
    // Wasn't cached, fetch it and cache it.
    status = await doa.getStatus(celeb);
    await redis.hmset(celebStatusKey, status);
    redis.expire(celebStatusKey, EXPIRY_TIME);
  }

  return status;
};

const setupNewGame = async (userId, numCelebs) => {
  // TODO this should move to Lua...
  const celebritySetKeyName = getKeyName(CELEBRITIES_KEY);
  const maxPossibleCelebs = await redis.scard(celebritySetKeyName);

  if (numCelebs < 1 || numCelebs > maxPossibleCelebs) {
    return false;
  }

  const userSetKeyName = getKeyName(userId, CELEBRITIES_KEY);
  await redis.del(userSetKeyName);

  let numUserCelebs = 0;

  do {
    let randomCeleb = await redis.srandmember(celebritySetKeyName);
    await redis.sadd(userSetKeyName, randomCeleb);
    numUserCelebs = await redis.scard(userSetKeyName);
  } while (numUserCelebs < numCelebs);

  // Expire the user's celebrity set later, as an automatic cleanup
  // if they abandon the game.
  redis.expire(userSetKeyName, EXPIRY_TIME);

  // Set user's initial score at 0, in case a previous value
  // was still there... also set expiry for automatic cleanup.
  redis.setex(getKeyName(userId, EXPIRY_TIME, SCORE_KEY), EXPIRY_TIME, 0);

  return true;
};

const getRandomCeleb = async (userId) => {
  const randomCeleb = await redis.spop(getKeyName(userId, CELEBRITIES_KEY));
  
  if (randomCeleb) {
    // Store the user's current celebrity, and expire it later, as 
    // an automatic cleanup if they abandon the game.
    redis.setex(getKeyName(userId, CURRENT_KEY), EXPIRY_TIME, randomCeleb);
  }

  return randomCeleb;
};

const validateAnswer = async (userId, isDead) => {
  // Get the current celeb for this user...
  const celebToCheck = await redis.get(getKeyName(userId, CURRENT_KEY));

  if (! celebToCheck) {
    return null;
  }

  // Get the celeb's status...
  const celebStatus = await getCelebStatus(celebToCheck);

  if (! celebStatus) {
    return null;
  }

  // Does the user's answer match the celeb's status?
  celebStatus.correct = isDead.toString() === celebStatus.dead;

  // If the user is right, increment their score.
  if (celebStatus.correct) {
    redis.incr(getKeyName(userId, SCORE_KEY));
  }

  return celebStatus;
};

const getScore = async (userId) => await redis.get(getKeyName(userId, SCORE_KEY));

const cleanupGame = async (userId) => {
  const pipeline = redis.pipeline();

  pipeline.del(getKeyName(userId, CURRENT_KEY));
  pipeline.del(getKeyName(userId, CELEBRITIES_KEY));
  pipeline.del(getKeyName(userId, SCORE_KEY));
  pipeline.exec();
};

const run = async () => {
  //const status = await getCelebStatus('Diego_Maradona');
  //console.log(status);
  const gameEstablished = await setupNewGame(998, 10);

  if (gameEstablished) {
    let currentCeleb;
    let userGuess = true;

    do {
      currentCeleb = await getRandomCeleb(998);
      if (currentCeleb) {
        console.log(currentCeleb);
        console.log(`user guess ${userGuess ? 'dead': 'alive'}`);

        const response = await validateAnswer(998, userGuess);

        if (response) {
          if (response.correct) {
            console.log('User was right!');
          } else {
            console.log('User was wrong!');
          }

          console.log(response.description);
        }
      }

      userGuess = !userGuess;
    } while (currentCeleb);

    const userScore = await getScore(998);
    console.log(`User scored ${userScore} out of 10.`);
    cleanupGame(998);
  }

  redis.quit();
};

run();