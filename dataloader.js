const { getRedisClient, getPrefixedKey } = require('./redis');
const dataset = require('./dataset.json');


const loadData = async () => {
  const redis = getRedisClient();
  const pipeline = redis.pipeline();
  
  // Delete the celebrities set.
  const celebritySetKey = getPrefixedKey('celebrities');
  pipeline.del(celebritySetKey);
  
  // Populate celebrities set and hashes.
  for (const celebrity of dataset.celebrities) {
    console.log(`Loading ${celebrity.name}...`);
    const celebrityName = celebrity.name.replace(/ /g, '_');
    pipeline.sadd(celebritySetKey, celebrityName);
    pipeline.hmset(getPrefixedKey(celebrityName), celebrity);
  }
  
  await pipeline.exec();
  
  redis.quit();

  console.log('Done.');
};

loadData();
