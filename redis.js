const Redis = require('ioredis');

const redisConf = {
  port: process.env.REDIS_PORT || 6379,
  host: process.env.REDIS_HOST || 'localhost'
};

const KEY_PREFIX = 'doa';

if (process.env.REDIS_PASSWORD) {
  redisConf.password = process.env.REDIS_PASSWORD;
}

const redis = new Redis(redisConf);

const getRedisClient = () => {
  return redis;
}

const getPrefixedKey = (key) => {
  return `${KEY_PREFIX}:${key}`;
};

module.exports = {
  getRedisClient,
  getPrefixedKey
};