# Alexa Dead or Alive Game

TODO description

## Setup (Code)

TODO

```bash
$ git clone https://github.com/simonprickett/alexa-dead-or-alive-game.git
$ cd alexa-dead-or-alive-game
$ npm install
```

TODO other stuff

## Setup (Redis)

TODO

## Loading the Data Set

The dataset of celebrities for the game can be found in `dataset.json` and needs to be loaded into Redis like so:

```bash
$ export REDIS_HOST=myredis.whatever.com
$ export REDIS_PORT=6379
$ export REDIS_PASSWORD=ssssh
$ npm run load
```

The code connects to Redis at localhost port 6379 with no password by default, set the environment variables as needed to point to your Redis instance.

## Verifying the Data Set was Loaded Correctly

```bash
$ redis-cli scard doa:celebrities
(integer) 100
$ redis-cli srandmember doa:celebrities
"Carl_Sagan"
$ redis-cli hgetall doa:Carl_Sagan
1) "name"
2) "Carl Sagan"
3) "bio"
4) "Astronomer and author"
```

You'll likely get a different result from `srandmember` as it picks a random set member, but just feed the result of that into `hgetall` and make sure that a celebrity hash is returned.