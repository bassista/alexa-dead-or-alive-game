const doa = require('wikipediadeadoralive');
const { getRedisClient, getKeyName } = require('./redis');

const redis = getRedisClient();
const EXPIRY_TIME = 60 * 60 * 24;

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

const run = async () => {
  const status = await getCelebStatus('Diego_Maradona');
  console.log(status);
  redis.quit();
};

run();