const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(-1);
  }
};
initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "sri", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.user_id = payload.user_id;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const selectUserQuery = `
  SELECT 
    * 
  FROM 
    user 
  WHERE 
    username = '${username}'`;

    const m = await db.get(selectUserQuery);

    if (m === undefined) {
      const createUserQuery = `
  INSERT INTO
    user (username, name, password, gender)
  VALUES
    (
      '${username}',
      '${name}',
      '${hashedPassword}',
      '${gender}'  
    );`;
      await db.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("User already exists");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "sri");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const getQuery = `
            SELECT
              DISTINCT username,
              tweet,
              date_time as dateTime
            FROM
             user inner join tweet on user.user_id=tweet.user_id
             inner join follower on tweet.user_id=follower.following_user_id
            WHERE 
            user.username=username
            ORDER BY
             date_time DESC
             LIMIT 4;`;

  const booksArray = await db.all(getQuery);
  response.send(booksArray);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const getQuery = `
            SELECT
              DISTINCT  name
            FROM
             user inner join follower on user.user_id=follower.follower_user_id;`;

  const booksArray = await db.all(getQuery);
  response.send(booksArray);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const getQuery = `
            SELECT
              DISTINCT name
            FROM
             user inner join follower on user.user_id=follower.follower_user_id
            ORDER BY
             username=username;`;

  const booksArray = await db.all(getQuery);
  response.send(booksArray);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const getQuery = `
            SELECT
              DISTINCT name
            FROM
             user inner join follower on user.user_id=follower.following_user_id
             inner join tweet on user.user_id=tweet.user_id
            WHERE
            tweet.tweet_id=${tweetId}`;

  const m = await db.get(getQuery);

  if (m === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const v = `
            SELECT
              tweet,
              count(like.like_id) as likes,
              count(reply.reply_id) as replies,
              tweet.date_time as dateTime
            FROM
             tweet left join like on tweet.tweet_id=like.tweet_id
             left join reply on tweet.tweet_id=reply.tweet_id
            GROUP BY
            tweet.tweet_id
            HAVING
            tweet.tweet_id=${tweetId};`;

    const a = await db.all(v);
    response.send(a);
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getBooksQuery = `
            SELECT
              DISTINCT name
            FROM
             user inner join follower on user.user_id=follower.following_user_id
             inner join tweet on user.user_id=tweet.user_id
            WHERE
            tweet.tweet_id=${tweetId}`;

    const m = await db.get(getBooksQuery);

    if (m === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const v = `
            SELECT
             DISTINCT name
            FROM
             user inner join like on user.user_id=like.user_id inner join
             tweet on user.user_id=tweet.user_id 
            GROUP BY
            tweet.tweet_id
            HAVING
            tweet.tweet_id=${tweetId};`;

      const a = await db.all(v);
      response.send(a);
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getQuery = `
            SELECT
              DISTINCT name
            FROM
             user inner join follower on user.user_id=follower.following_user_id
             inner join tweet on user.user_id=tweet.user_id
            WHERE
            tweet.tweet_id=${tweetId}`;

    const m = await db.get(getQuery);

    if (m === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const v = `
            SELECT
             DISTINCT name
            FROM
             user inner join reply on user.user_id=reply.user_id inner join
             tweet on user.user_id=tweet.user_id 
            GROUP BY
            tweet.tweet_id
            HAVING
            tweet.tweet_id=${tweetId};`;

      const a = await db.all(v);
      response.send({ replies: a });
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const v = `
            SELECT
              tweet,
              count(like.like_id) as likes,
              count(reply.reply_id) as replies,
              tweet.date_time as dateTime
            FROM
             user left join tweet on user.user_id=tweet.user_id left join like on tweet.tweet_id=like.tweet_id
             left join reply on tweet.tweet_id=reply.tweet_id
            GROUP BY
            tweet.tweet_id
            HAVING
            user.username=username`;

  const a = await db.all(v);
  response.send(a);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;

  const v = `
      INSERT INTO 
        tweet (tweet) 
      VALUES 
        (
          '${tweet}'
        )`;
  await db.run(v);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getQuery = `
            SELECT
              *
            FROM
             user inner join tweet on user.user_id=tweet.user_id
            WHERE
            tweet.tweet_id=${tweetId}
            and user.username=username`;

    const m = await db.get(getQuery);

    if (m === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteQuery = `
      DELETE FROM
        tweet
      WHERE
        tweet_id = ${tweetId};`;

      await db.run(deleteQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
