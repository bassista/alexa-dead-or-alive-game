# Alexa Dead or Alive Game

This is a celebrity dead or alive game for Alexa that uses Redis as a data store and cache.  

TODO describe game...

Read about the npm package that I wrote to scrape dead or alive information from Wikipedia [here](https://simonprickett.dev/wikipedia-dead-or-alive/).

## Setup (Code)

Clone the repo and install the data loader's dependencies:

```bash
$ git clone https://github.com/simonprickett/alexa-dead-or-alive-game.git
$ cd alexa-dead-or-alive-game/dataloader
```

## Setup (Redis)

This skill uses Redis to store the set of celebrities that can appear in the game, and the subset chosen for each run of the game.  Redis is also used as a cache to store dead or alive status lookups from Wikipedia.

You'll need a Redis instance that can be reached from an AWS Lambda function.  Redis Labs provides a free 30Mb instance hosted on AWS and managed for you.  This will be plenty of space for this project, and you can [sign up here](https://redislabs.com/try-free/).

Once you have your Redis hostname, port and password (if needed), create a file called .env in the `alexaskill/lamba` folder that looks like this:

```
REDIS_PORT=9999
REDIS_HOST=myredishost.redislabs.com
REDIS_PASSWORD=ssssssssh
```

Replace the values with those for your Redis instance. Alexa hosted skills don't seem to support environment variables directly in the same way as regular Lambda functions in AWS, so I used the [dotenv package](https://www.npmjs.com/package/dotenv) and a `.env` file to keep secrets out of the code instead.

You shouldn't commit `.env` to GitHub, as you'll be sharing your secrets!

## Loading the Dataset

Before you can run the game, you'll need to load the dataset into your Redis instance.

The dataset of celebrities can be found in `dataset.json` and needs to be loaded into Redis like so:

```bash
$ export REDIS_HOST=myredis.whatever.com
$ export REDIS_PORT=6379
$ export REDIS_PASSWORD=ssssh
$ npm run load
```

The code connects to Redis at localhost port 6379 with no password by default.  Set the environment variables as needed to point to your hosted Redis instance.

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

You'll likely get a different result from `srandmember` as it picks a random set member, but just feed the result of that into `hgetall` and make sure that a celebrity hash is returned.  This data is used in the game to pick a subset of the celebrities to ask the user about - the `bio` fields are used to give the user some context when asking if they think whether or not someone is dead or alive.

If you're using a Redis instance that isn't hosted locally, be sure to specify your hostname, user and password as necessary when starting `redis-cli`, for example:

```bash
$ redis-cli -h somehost -p 9999 -a secretpassword
```