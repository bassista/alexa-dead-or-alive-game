const Redis = require('ioredis');
const dataset = require('./dataset.json');

const redisConf = {
  port: process.env.REDIS_PORT || 6379,
  host: process.env.REDIS_HOST || 'localhost'
};

const KEY_PREFIX = 'doa';

if (process.env.REDIS_PASSWORD) {
  redisConf.password = process.env.REDIS_PASSWORD;
}

const loadData = async () => {
  const redis = new Redis(redisConf);
  const pipeline = redis.pipeline();
  
  // Delete the celebrities set.
  const celebritySetKey = `${KEY_PREFIX}:celebrities`;
  pipeline.del(celebritySetKey);
  
  // Populate celebrities set and hashes.
  for (const celebrity of dataset.celebrities) {
    console.log(`Loading ${celebrity.name}...`);
    const celebrityName = celebrity.name.replace(/ /g, '_');
    pipeline.sadd(celebritySetKey, celebrityName);
    pipeline.hmset(`${KEY_PREFIX}:${celebrityName}`, celebrity);
  }
  
  await pipeline.exec();
  
  redis.quit();

  console.log('Done.');
};

loadData();
