const doa = require('wikipediadeadoralive');
const { getRedisClient, getKeyName } = require('./redis');

const redis = getRedisClient();
const EXPIRY_TIME = 60 * 60 * 24;

const CELEBRITIES_KEY = 'celebrities';
const CURRENT_KEY = 'current';

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

  // TODO set a long expire on userSetKeyName so it naturally
  // dies off if the the user abandons the game.

  return true;
};

const getRandomCeleb = async (userId) => {
  const randomCeleb = await redis.spop(getKeyName(userId, CELEBRITIES_KEY));
  
  if (randomCeleb) {
    redis.setex(getKeyName(userId, CURRENT_KEY), EXPIRY_TIME, randomCeleb);
  }

  return randomCeleb;
};

const validateAnswer = async (userId, isDead) => {
  // Get the current celeb for this user
  // Are they dead?
  // Return the celeb data and whether the user got this right or wrong...
};

const cleanupGame = async (userId) => {
  const pipeline = redis.pipeline();

  pipeline.del(getKeyName(userId, CURRENT_KEY));
  pipeline.del(getKeyName(userId, CELEBRITIES_KEY));
  pipeline.exec();
};

const run = async () => {
  //const status = await getCelebStatus('Diego_Maradona');
  //console.log(status);
  const gameEstablished = await setupNewGame(998, 10);

  if (gameEstablished) {
    let currentCeleb;

    do {
      currentCeleb = await getRandomCeleb(998);
      if (currentCeleb) {
        const celebStatus = await getCelebStatus(currentCeleb);
        console.log(celebStatus);
      }
    } while (currentCeleb);

    console.log('All done!');
    cleanupGame(998);
  }

  redis.quit();
};

run();