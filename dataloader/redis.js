const Redis = require('ioredis');

const redisConf = {
  port: process.env.REDIS_PORT || 6379,
  host: process.env.REDIS_HOST || 'localhost'
};

const KEY_PREFIX = 'doa';
const KEY_SEPARATOR = ':';

if (process.env.REDIS_PASSWORD) {
  redisConf.password = process.env.REDIS_PASSWORD;
}

const redis = new Redis(redisConf);

const getRedisClient = () => {
  return redis;
}

const getKeyName = (...args) => `${KEY_PREFIX}${KEY_SEPARATOR}${args.join(KEY_SEPARATOR)}`;

module.exports = {
  getRedisClient,
  getKeyName
};